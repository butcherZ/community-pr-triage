import 'dotenv/config';
import { createInterface } from 'node:readline';
import { AREA_TIERS, validateConfig } from './config.js';
import { fetchInternalAuthors, fetchCommunityPRs, fetchRecentlyMergedPRNumbers, fetchIssue, parseIssueRefs, parseLinkedIssueData, extractArea, estimateAreaFromFiles } from './fetcher.js';
import { calculateValue, calculateComplexity, calculatePriority, isQuickWin } from './scorer.js';
import { syncToLinear, findSiblingPRs } from './syncer.js';
import { printReport, generateMarkdownReport } from './reporter.js';
import { selectSprintPRs, formatSprintUpdate, postSprintUpdate } from './sprint.js';
import type { ScoredPR, LinkedIssueData } from './types.js';

function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes');
    });
  });
}

function getAreaTier(area: string): string {
  for (const [tier, areas] of Object.entries(AREA_TIERS)) {
    if (areas.includes(area)) return tier;
  }
  return 'medium';
}

function getPRType(labels: string[]): string {
  for (const label of labels) {
    if (label.startsWith('pr: ')) return label.replace('pr: ', '');
  }
  return 'unknown';
}

async function main() {
  validateConfig();

  const dryRun = process.argv.includes('--dry-run');
  const sprintUpdate = process.argv.includes('--sprint-update');
  const autoYes = process.argv.includes('--yes') || process.argv.includes('-y');

  console.log('Fetching internal authors from GitHub org...');
  const internalAuthors = fetchInternalAuthors();
  console.log(`Found ${internalAuthors.size} internal authors.\n`);

  console.log('Fetching community PRs from GitHub...');
  const prs = fetchCommunityPRs(internalAuthors);
  console.log(`Found ${prs.length} community PRs.\n`);

  console.log('Fetching linked issue data...');
  const scoredPRs: ScoredPR[] = [];

  for (const pr of prs) {
    const issueNumbers = parseIssueRefs(pr.body);
    const linkedIssues: LinkedIssueData[] = [];

    for (const num of issueNumbers) {
      const issue = await fetchIssue(num);
      if (issue) linkedIssues.push(parseLinkedIssueData(issue));
    }

    const ageDays = Math.floor((Date.now() - new Date(pr.createdAt).getTime()) / 86400000);
    let area = extractArea(pr.labels);
    if (area === 'unknown') area = estimateAreaFromFiles(pr.files);
    const areaTier = getAreaTier(area);
    const loc = pr.additions + pr.deletions;

    const value = calculateValue(pr, linkedIssues, ageDays);
    const complexity = calculateComplexity(loc, pr.changedFiles, areaTier);
    const priority = calculatePriority(value.total);

    scoredPRs.push({
      pr, linkedIssues, value, complexity, priority,
      area, areaTier, prType: getPRType(pr.labels),
      isQuickWin: isQuickWin(value.total, complexity),
    });
  }

  scoredPRs.sort((a, b) => b.value.total - a.value.total);
  printReport(scoredPRs);

  // Generate markdown report
  const reportPath = `reports/triage-${new Date().toISOString().split('T')[0]}.md`;
  generateMarkdownReport(scoredPRs, reportPath);
  console.log(`Markdown report saved to: ${reportPath}\n`);

  if (sprintUpdate) {
    const sprintPRs = selectSprintPRs(scoredPRs);
    console.log(`\nSprint recommendation (${sprintPRs.length} PRs):\n`);
    console.log(formatSprintUpdate(sprintPRs, scoredPRs.length));

    if (dryRun) {
      console.log('[DRY RUN] Skipping sprint update post.\n');
    } else {
      const confirmed = autoYes || await confirm('Post this sprint update to Linear? (y/N) ');
      if (confirmed) {
        const url = await postSprintUpdate(sprintPRs, scoredPRs.length);
        console.log(`Sprint update posted: ${url}\n`);
      } else {
        console.log('Sprint update skipped.\n');
      }
    }
  }

  // Preview sibling PR relations
  const siblingPairs = findSiblingPRs(scoredPRs);
  if (siblingPairs.length > 0) {
    console.log(`Sibling PRs (shared GitHub issues) — ${siblingPairs.length} relation(s) to link:`);
    for (const [a, b] of siblingPairs) {
      const prA = scoredPRs.find((s) => s.pr.number === a);
      const prB = scoredPRs.find((s) => s.pr.number === b);
      const titleA = prA ? prA.pr.title.slice(0, 60) : `#${a}`;
      const titleB = prB ? prB.pr.title.slice(0, 60) : `#${b}`;
      console.log(`  PR #${a} (${titleA}) ↔ PR #${b} (${titleB})`);
    }
    console.log();
  }

  if (dryRun) {
    console.log('[DRY RUN] Skipping Linear sync.\n');
  } else {
    const confirmed = autoYes || await confirm(`About to sync ${scoredPRs.length} PRs to Linear. Proceed? (y/N) `);
    if (!confirmed) {
      console.log('Sync canceled.\n');
      return;
    }
    console.log('Fetching recently merged PRs...');
    const mergedPRNumbers = fetchRecentlyMergedPRNumbers();
    console.log(`Found ${mergedPRNumbers.size} recently merged PRs.\n`);
    console.log('Syncing to Linear...');
    const stats = await syncToLinear(scoredPRs, mergedPRNumbers);
    console.log(`Linear sync complete: ${stats.created} created, ${stats.updated} updated, ${stats.closed} closed, ${stats.relationsCreated} relations linked.\n`);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
