import { LinearClient } from '@linear/sdk';
import { LINEAR_TEAM_ID, LINEAR_STATUSES, LINEAR_LABELS } from './config.js';
import type { ScoredPR, PriorityTier } from './types.js';

// --- Pure helpers (unit-testable) ---

export function matchPRNumber(title: string): number | null {
  const match = title.match(/^PR #(\d+):/);
  return match ? parseInt(match[1], 10) : null;
}

export function mapPriorityToLinear(priority: PriorityTier): number {
  const map: Record<PriorityTier, number> = { urgent: 1, high: 2, normal: 3, low: 4 };
  return map[priority];
}

export function mapLabelsToLinear(ghLabels: string[]): string[] {
  return ghLabels
    .map((l) => LINEAR_LABELS[l])
    .filter((id): id is string => id !== undefined);
}

export function buildDescription(scored: ScoredPR): string {
  const { pr, linkedIssues, value, complexity, priority, area, areaTier, prType, isQuickWin } = scored;
  const loc = pr.additions + pr.deletions;
  const ageDays = Math.floor((Date.now() - new Date(pr.createdAt).getTime()) / 86400000);
  const sizeLabel = loc < 50 ? 'S' : loc < 300 ? 'M' : loc < 1000 ? 'L' : 'XL';

  let desc = `**Author**: @${pr.author}\n`;
  desc += `**Area**: ${area} (${areaTier} risk tier)\n`;
  desc += `**Type**: ${prType} | **Size**: ${sizeLabel} (${loc} LOC, ${pr.changedFiles} files)\n`;
  desc += `**Age**: ${ageDays} days | **CI**: ${pr.ciStatus}\n\n`;

  if (linkedIssues.length > 0) {
    desc += `### Linked Issues\n`;
    for (const li of linkedIssues) {
      desc += `- #${li.issue.number} — ${li.issue.title} (${li.issue.thumbsUp} thumbs-up, ${li.issue.comments} comments)`;
      if (li.severity !== 'none') desc += ` | severity: ${li.severity}`;
      if (li.status !== 'none') desc += ` | status: ${li.status}`;
      desc += '\n';
    }
    desc += '\n';
  }

  desc += `### Scores\n`;
  desc += `Value: (Base:${value.base} + Severity:${value.severity} + Status:${value.status} + Engagement:${value.engagement}) x Urgency:${value.urgency} = ${value.total} -> ${priority}\n`;
  desc += `Complexity: ${complexity}\n`;
  desc += `Quick Win: ${isQuickWin ? 'Yes' : 'No'}\n\n`;
  desc += `[View PR on GitHub](https://github.com/strapi/strapi/pull/${pr.number})`;

  return desc;
}

// --- I/O functions (Linear API) ---

interface ExistingIssue {
  id: string;
  title: string;
  stateType: string;
}

export async function syncToLinear(scoredPRs: ScoredPR[]): Promise<{
  created: number;
  updated: number;
  closed: number;
  relationsCreated: number;
}> {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) throw new Error('LINEAR_API_KEY environment variable is required');

  const client = new LinearClient({ apiKey });
  const stats = { created: 0, updated: 0, closed: 0, relationsCreated: 0 };

  // Fetch all existing issues in the team
  const existingIssues: ExistingIssue[] = [];
  let hasNext = true;
  let cursor: string | undefined;

  while (hasNext) {
    const result = await client.issues({
      filter: { team: { id: { eq: LINEAR_TEAM_ID } } },
      after: cursor,
      first: 100,
    });
    for (const issue of result.nodes) {
      const state = await issue.state;
      existingIssues.push({
        id: issue.id,
        title: issue.title,
        stateType: state?.type ?? 'triage',
      });
    }
    hasNext = result.pageInfo.hasNextPage;
    cursor = result.pageInfo.endCursor;
  }

  // Build lookup: PR number -> existing Linear issue
  const issueByPR = new Map<number, ExistingIssue>();
  for (const issue of existingIssues) {
    const prNum = matchPRNumber(issue.title);
    if (prNum) issueByPR.set(prNum, issue);
  }

  const openPRNumbers = new Set(scoredPRs.map((s) => s.pr.number));

  // Track PR Linear issue IDs for relation linking
  const prLinearIssueIds = new Map<number, string>();

  for (const scored of scoredPRs) {
    const existing = issueByPR.get(scored.pr.number);
    const linearPriority = mapPriorityToLinear(scored.priority);
    const labelIds = mapLabelsToLinear(scored.pr.labels);
    const description = buildDescription(scored);

    if (existing) {
      await client.updateIssue(existing.id, {
        priority: linearPriority,
        description,
        labelIds,
      });
      prLinearIssueIds.set(scored.pr.number, existing.id);
      stats.updated++;
    } else {
      const result = await client.createIssue({
        teamId: LINEAR_TEAM_ID,
        title: `PR #${scored.pr.number}: ${scored.pr.title}`,
        description,
        priority: linearPriority,
        stateId: LINEAR_STATUSES.triage,
        labelIds,
      });
      const created = await result.issue;
      if (created) prLinearIssueIds.set(scored.pr.number, created.id);
      stats.created++;
    }
  }

  // Link PR Linear issues to related GitHub issue Linear issues
  for (const scored of scoredPRs) {
    const prIssueId = prLinearIssueIds.get(scored.pr.number);
    if (!prIssueId || scored.linkedIssues.length === 0) continue;

    // Get existing relations to avoid duplicates
    const existingRelations = new Set<string>();
    try {
      const prIssue = await client.issue(prIssueId);
      const relations = await prIssue.relations();
      for (const rel of relations.nodes) {
        const related = await rel.relatedIssue;
        if (related) existingRelations.add(related.id);
      }
      const inverseRelations = await prIssue.inverseRelations();
      for (const rel of inverseRelations.nodes) {
        const related = await rel.issue;
        if (related) existingRelations.add(related.id);
      }
    } catch {
      // If we can't fetch relations, proceed anyway — duplicates will be caught by Linear
    }

    for (const linked of scored.linkedIssues) {
      const ghIssueNum = linked.issue.number;
      const searchTerm = `github.com/strapi/strapi/issues/${ghIssueNum}`;

      try {
        const searchResult = await client.searchIssues(searchTerm, { first: 5 });
        for (const node of searchResult.nodes) {
          // Skip if it's the same issue or already related
          if (node.id === prIssueId || existingRelations.has(node.id)) continue;

          await client.createIssueRelation({
            issueId: prIssueId,
            relatedIssueId: node.id,
            type: 'related' as any,
          });
          existingRelations.add(node.id);
          stats.relationsCreated++;
        }
      } catch {
        // Search or relation creation failed for this issue, continue
      }
    }
  }

  // Close Linear issues for PRs no longer open
  for (const [prNum, issue] of issueByPR) {
    if (!openPRNumbers.has(prNum) && !['completed', 'canceled'].includes(issue.stateType)) {
      await client.updateIssue(issue.id, { stateId: LINEAR_STATUSES.canceled });
      stats.closed++;
    }
  }

  return stats;
}
