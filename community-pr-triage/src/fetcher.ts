import { execFileSync } from 'node:child_process';
import { REPO, STRAPI_ORG, BOT_PATTERNS } from './config.js';
import type { GitHubPR, GitHubIssue, LinkedIssueData } from './types.js';

// --- Pure helpers (unit-testable) ---

export function parseIssueRefs(body: string): number[] {
  const refs = new Set<number>();
  const hashPattern = /(?:fixes|closes|resolves|ref|related)?\s*#(\d{3,5})/gi;
  for (const match of body.matchAll(hashPattern)) {
    refs.add(parseInt(match[1], 10));
  }
  const urlPattern = /github\.com\/strapi\/strapi\/issues\/(\d{3,5})/g;
  for (const match of body.matchAll(urlPattern)) {
    refs.add(parseInt(match[1], 10));
  }
  return [...refs].filter((n) => n >= 100);
}

export function isCommunityAuthor(author: string, internalAuthors: Set<string>): boolean {
  if (internalAuthors.has(author)) return false;
  if (BOT_PATTERNS.some((p) => author.includes(p))) return false;
  return true;
}

export function parseCIStatus(
  checks: Array<{ status: string; conclusion: string | null }>
): 'passing' | 'failing' | 'pending' {
  if (checks.length === 0) return 'pending';
  if (checks.some((c) => c.conclusion === 'FAILURE')) return 'failing';
  if (checks.every((c) => c.status === 'COMPLETED' && c.conclusion === 'SUCCESS')) return 'passing';
  return 'pending';
}

export function extractArea(labels: string[]): string {
  for (const label of labels) {
    if (!label.startsWith('source:')) continue;
    const value = label.replace('source:', '').trim();
    const parts = value.split(':');
    return parts[parts.length - 1];
  }
  return 'unknown';
}

// --- I/O functions (gh CLI via execFileSync — no shell) ---

function gh(args: string[]): string {
  return execFileSync('gh', args, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
}

export function fetchInternalAuthors(): Set<string> {
  const raw = gh([
    'api', `orgs/${STRAPI_ORG}/members`,
    '--paginate',
    '--jq', '.[].login',
  ]);
  const logins = raw.trim().split('\n').filter(Boolean);
  return new Set(logins);
}

export async function fetchCommunityPRs(internalAuthors: Set<string>): Promise<GitHubPR[]> {
  const fields = [
    'number', 'title', 'author', 'body', 'labels', 'additions', 'deletions',
    'changedFiles', 'createdAt', 'state', 'isDraft', 'mergedAt', 'closedAt',
    'statusCheckRollup',
  ].join(',');

  const raw = gh(['pr', 'list', '--repo', REPO, '--state', 'open', '--limit', '200', '--json', fields]);
  const prs = JSON.parse(raw) as Array<Record<string, any>>;

  return prs
    .filter((pr) => isCommunityAuthor(pr.author.login, internalAuthors))
    .filter((pr) => !pr.isDraft)
    .map((pr) => ({
      number: pr.number,
      title: pr.title,
      author: pr.author.login,
      body: pr.body || '',
      labels: pr.labels.map((l: any) => l.name),
      additions: pr.additions,
      deletions: pr.deletions,
      changedFiles: pr.changedFiles,
      createdAt: pr.createdAt,
      state: pr.state,
      isDraft: pr.isDraft,
      mergedAt: pr.mergedAt,
      closedAt: pr.closedAt,
      ciStatus: parseCIStatus(pr.statusCheckRollup || []),
    }));
}

export async function fetchIssue(issueNumber: number): Promise<GitHubIssue | null> {
  try {
    const raw = gh([
      'api', `repos/${REPO}/issues/${issueNumber}`,
      '--jq', '{number: .number, title: .title, labels: [.labels[].name], thumbsUp: .reactions["+1"], comments: .comments, state: .state}',
    ]);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function parseLinkedIssueData(issue: GitHubIssue): LinkedIssueData {
  let severity: LinkedIssueData['severity'] = 'none';
  let status: LinkedIssueData['status'] = 'none';

  for (const label of issue.labels) {
    if (label === 'severity: critical') severity = 'critical';
    else if (label === 'severity: high' && severity !== 'critical') severity = 'high';
    else if (label === 'severity: medium' && !['critical', 'high'].includes(severity)) severity = 'medium';
    else if (label === 'severity: low' && severity === 'none') severity = 'low';

    if (label === 'status: confirmed') status = 'confirmed';
    else if (label === 'status: pending reproduction' && status !== 'confirmed') status = 'pending_repro';
    else if (label === 'status: can not reproduce') status = 'cant_repro';
  }

  return { issue, severity, status };
}
