# Community PR Triage Tool — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a TypeScript CLI that fetches community PRs from strapi/strapi, scores them, syncs to Linear, and prints a triage report.

**Architecture:** Standalone TypeScript project using `gh` CLI for GitHub data (no octokit) and `@linear/sdk` for Linear sync. Four modules: fetcher, scorer, syncer, reporter. CLI entry point with `--dry-run` flag.

**Tech Stack:** TypeScript, `tsx` (runner), `@linear/sdk`, `gh` CLI (via `execFileSync` — no shell), `vitest` (testing)

**Design doc:** `docs/plans/2026-02-26-community-pr-triage-tool-design.md`

---

## Task 1: Project Scaffolding

**Files:**
- Create: `community-pr-triage/package.json`
- Create: `community-pr-triage/tsconfig.json`
- Create: `community-pr-triage/.env.example`
- Create: `community-pr-triage/.gitignore`
- Create: `community-pr-triage/src/types.ts`
- Create: `community-pr-triage/src/config.ts`

**Step 1: Create project directory and package.json**

```bash
mkdir -p community-pr-triage/src
```

`community-pr-triage/package.json`:
```json
{
  "name": "community-pr-triage",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "tsx src/index.ts",
    "dry-run": "tsx src/index.ts --dry-run",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@linear/sdk": "^37.0.0"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0",
    "dotenv": "^16.4.0"
  }
}
```

**Step 2: Create tsconfig.json**

`community-pr-triage/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true
  },
  "include": ["src"]
}
```

**Step 3: Create .env.example and .gitignore**

`community-pr-triage/.env.example`:
```
LINEAR_API_KEY=lin_api_xxxxx
```

`community-pr-triage/.gitignore`:
```
node_modules/
dist/
.env
```

**Step 4: Create types.ts**

`community-pr-triage/src/types.ts`:
```typescript
export interface GitHubPR {
  number: number;
  title: string;
  author: string;
  body: string;
  labels: string[];
  additions: number;
  deletions: number;
  changedFiles: number;
  createdAt: string;
  state: string;
  isDraft: boolean;
  mergedAt: string | null;
  closedAt: string | null;
  ciStatus: 'passing' | 'failing' | 'pending';
}

export interface GitHubIssue {
  number: number;
  title: string;
  labels: string[];
  thumbsUp: number;
  comments: number;
  state: string;
}

export interface LinkedIssueData {
  issue: GitHubIssue;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'none';
  status: 'confirmed' | 'pending_repro' | 'cant_repro' | 'none';
}

export type ComplexityTier = 'low' | 'medium' | 'high' | 'very_high';

export type PriorityTier = 'urgent' | 'high' | 'normal' | 'low';

export interface ValueBreakdown {
  base: number;
  severity: number;
  status: number;
  engagement: number;
  urgency: number;
  total: number;
}

export interface ScoredPR {
  pr: GitHubPR;
  linkedIssues: LinkedIssueData[];
  value: ValueBreakdown;
  complexity: ComplexityTier;
  priority: PriorityTier;
  area: string;
  areaTier: string;
  prType: string;
  isQuickWin: boolean;
}
```

**Step 5: Create config.ts**

`community-pr-triage/src/config.ts`:
```typescript
export const REPO = 'strapi/strapi';

export const INTERNAL_AUTHORS = [
  'butcherZ', 'mathildeleg', 'nclsndr', 'markkaylor',
  'Adzouz', 'innerdvations', 'derrickmehaffy', 'Bassel17',
  'alex-strapi', 'remidej', 'PaulBratslavsky', 'unrevised6419',
  'jhoward1994', 'HichamELBSI',
];

export const BOT_PATTERNS = ['[bot]', 'app/dependabot', 'renovate'];

export const AREA_TIERS: Record<string, string[]> = {
  critical: ['database', 'strapi'],
  high: ['content-manager', 'upload', 'users-permissions'],
  medium: ['admin', 'content-type-builder', 'i18n'],
  low: ['documentation', 'graphql', 'typescript', 'dependencies'],
};

export const LINEAR_TEAM_ID = 'a545ae90-ba50-4427-83e6-c0ce7dde9528';

export const LINEAR_STATUSES = {
  triage: 'cf0651ff-654a-464e-893b-bb18af7053e5',
  done: 'c82d01d6-921f-4774-8031-584b1be9fc63',
  canceled: '79faca9e-011b-422a-b8cc-d41dcab6f8cd',
} as const;

export const LINEAR_LABELS: Record<string, string> = {
  'pr: fix': 'a850ce54-33cd-4917-a06a-4d2df6dafab2',
  'pr: feature': '5e7646f1-4f73-4d37-9b2b-3ededc0c2475',
  'pr: enhancement': '54d83c27-3456-4fb9-98e2-15fab6c0eb3d',
  'pr: chore': 'f0230cb8-d531-4a6c-9836-c4278741fb38',
  'pr: doc': '6711572b-0ab3-4a0d-9338-eac4479d8191',
};
```

**Step 6: Install dependencies**

```bash
cd community-pr-triage && npm install
```

**Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold community-pr-triage project"
```

---

## Task 2: Scorer — Value + Complexity

The scorer is pure logic with no I/O, easiest to test first.

**Files:**
- Create: `community-pr-triage/src/scorer.ts`
- Create: `community-pr-triage/src/__tests__/scorer.test.ts`

**Step 1: Write failing tests for value scoring**

`community-pr-triage/src/__tests__/scorer.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { calculateValue, calculateComplexity, calculatePriority, isQuickWin } from '../scorer.js';
import type { GitHubPR, LinkedIssueData } from '../types.js';

const makePR = (overrides: Partial<GitHubPR> = {}): GitHubPR => ({
  number: 1,
  title: 'test',
  author: 'contributor',
  body: '',
  labels: ['pr: fix'],
  additions: 20,
  deletions: 5,
  changedFiles: 2,
  createdAt: new Date().toISOString(),
  state: 'open',
  isDraft: false,
  mergedAt: null,
  closedAt: null,
  ciStatus: 'passing',
  ...overrides,
});

const makeLinkedIssue = (overrides: Partial<LinkedIssueData> = {}): LinkedIssueData => ({
  issue: { number: 100, title: 'bug', labels: [], thumbsUp: 0, comments: 0, state: 'open' },
  severity: 'none',
  status: 'none',
  ...overrides,
});

describe('calculateValue', () => {
  it('scores a bug fix with no linked issues as base only', () => {
    const result = calculateValue(makePR({ labels: ['pr: fix'] }), [], 0);
    expect(result.base).toBe(30);
    expect(result.total).toBe(30);
  });

  it('adds severity from linked critical issue', () => {
    const linked = [makeLinkedIssue({ severity: 'critical', status: 'confirmed' })];
    const result = calculateValue(makePR({ labels: ['pr: fix'] }), linked, 0);
    expect(result.severity).toBe(50);
    expect(result.status).toBe(15);
    expect(result.total).toBe(95);
  });

  it('caps engagement at 40', () => {
    const linked = [makeLinkedIssue({
      issue: { number: 100, title: 'popular', labels: [], thumbsUp: 60, comments: 40, state: 'open' },
    })];
    const result = calculateValue(makePR({ labels: ['pr: fix'] }), linked, 0);
    expect(result.engagement).toBe(40);
  });

  it('applies urgency multiplier for old PRs', () => {
    const result = calculateValue(makePR({ labels: ['pr: enhancement'] }), [], 50);
    expect(result.urgency).toBe(2.0);
    expect(result.total).toBe(40);
  });

  it('uses highest severity when multiple issues linked', () => {
    const linked = [
      makeLinkedIssue({ severity: 'low' }),
      makeLinkedIssue({ severity: 'high' }),
    ];
    const result = calculateValue(makePR({ labels: ['pr: fix'] }), linked, 0);
    expect(result.severity).toBe(35);
  });

  it('scores dependency PR with base 5', () => {
    const result = calculateValue(makePR({ labels: ['pr: chore', 'source: dependencies'] }), [], 0);
    expect(result.base).toBe(5);
  });
});

describe('calculateComplexity', () => {
  it('returns low for small PR in low-risk area', () => {
    expect(calculateComplexity(20, 2, 'low')).toBe('low');
  });

  it('returns medium for mid-size PR', () => {
    expect(calculateComplexity(150, 5, 'high')).toBe('medium');
  });

  it('bumps up for critical area', () => {
    expect(calculateComplexity(30, 2, 'critical')).toBe('medium');
  });

  it('returns very_high for XL PR', () => {
    expect(calculateComplexity(1500, 20, 'high')).toBe('very_high');
  });

  it('clamps down for low-risk area', () => {
    expect(calculateComplexity(100, 3, 'low')).toBe('low');
  });
});

describe('calculatePriority', () => {
  it('maps 100+ to urgent', () => expect(calculatePriority(120)).toBe('urgent'));
  it('maps 70-99 to high', () => expect(calculatePriority(85)).toBe('high'));
  it('maps 50-69 to normal', () => expect(calculatePriority(55)).toBe('normal'));
  it('maps <50 to low', () => expect(calculatePriority(30)).toBe('low'));
});

describe('isQuickWin', () => {
  it('true when value >= 30 and complexity low', () => expect(isQuickWin(45, 'low')).toBe(true));
  it('false when value < 30', () => expect(isQuickWin(20, 'low')).toBe(false));
  it('false when complexity not low', () => expect(isQuickWin(80, 'medium')).toBe(false));
});
```

**Step 2: Run tests to verify they fail**

```bash
cd community-pr-triage && npx vitest run src/__tests__/scorer.test.ts
```

Expected: FAIL — module `../scorer.js` not found.

**Step 3: Implement scorer**

`community-pr-triage/src/scorer.ts`:
```typescript
import type { GitHubPR, LinkedIssueData, ValueBreakdown, ComplexityTier, PriorityTier } from './types.js';

const BASE_SCORES: Record<string, number> = {
  'pr: fix': 30,
  'pr: enhancement': 20,
  'pr: doc': 15,
  'pr: feature': 10,
  'pr: chore': 10,
};

const SEVERITY_SCORES: Record<string, number> = {
  critical: 50, high: 35, medium: 20, low: 5, none: 0,
};

const STATUS_SCORES: Record<string, number> = {
  confirmed: 15, pending_repro: 5, cant_repro: -10, none: 0,
};

const URGENCY_BRACKETS: [number, number][] = [
  [46, 2.0], [31, 1.8], [22, 1.6], [15, 1.4], [8, 1.2], [0, 1.0],
];

function getBase(labels: string[]): number {
  if (labels.some((l) => l.includes('dependencies'))) return 5;
  for (const label of labels) {
    if (BASE_SCORES[label] !== undefined) return BASE_SCORES[label];
  }
  return 10;
}

function getUrgency(ageDays: number): number {
  for (const [minDays, multiplier] of URGENCY_BRACKETS) {
    if (ageDays >= minDays) return multiplier;
  }
  return 1.0;
}

function getEngagement(linkedIssues: LinkedIssueData[]): number {
  let raw = 0;
  for (const { issue } of linkedIssues) {
    raw += issue.thumbsUp;
    raw += Math.floor(issue.comments * 0.5);
    if (issue.thumbsUp >= 50) raw += 15;
    else if (issue.thumbsUp >= 20) raw += 10;
    else if (issue.thumbsUp >= 10) raw += 5;
  }
  return Math.min(raw, 40);
}

export function calculateValue(
  pr: GitHubPR, linkedIssues: LinkedIssueData[], ageDays: number
): ValueBreakdown {
  const base = getBase(pr.labels);
  const severity = Math.max(0, ...linkedIssues.map((li) => SEVERITY_SCORES[li.severity] ?? 0));
  const status = Math.max(0, ...linkedIssues.map((li) => STATUS_SCORES[li.status] ?? 0));
  const engagement = getEngagement(linkedIssues);
  const urgency = getUrgency(ageDays);
  const total = Math.round((base + severity + status + engagement) * urgency);
  return { base, severity, status, engagement, urgency, total };
}

const COMPLEXITY_TIERS: ComplexityTier[] = ['low', 'medium', 'high', 'very_high'];

export function calculateComplexity(loc: number, files: number, areaTier: string): ComplexityTier {
  let tierIndex: number;
  if (loc > 1000) tierIndex = 3;
  else if (loc > 300) tierIndex = 2;
  else if (loc > 50 || files > 10) tierIndex = 1;
  else tierIndex = 0;

  if (areaTier === 'critical') tierIndex = Math.min(tierIndex + 1, 3);
  if (areaTier === 'low') tierIndex = Math.max(tierIndex - 1, 0);
  return COMPLEXITY_TIERS[tierIndex];
}

export function calculatePriority(valueScore: number): PriorityTier {
  if (valueScore >= 100) return 'urgent';
  if (valueScore >= 70) return 'high';
  if (valueScore >= 50) return 'normal';
  return 'low';
}

export function isQuickWin(valueScore: number, complexity: ComplexityTier): boolean {
  return valueScore >= 30 && complexity === 'low';
}
```

**Step 4: Run tests to verify they pass**

```bash
cd community-pr-triage && npx vitest run src/__tests__/scorer.test.ts
```

Expected: all PASS.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add value and complexity scoring logic with tests"
```

---

## Task 3: Fetcher — GitHub data via `gh` CLI

Uses `execFileSync` (not `execSync`) to avoid shell injection. All arguments passed as arrays.

**Files:**
- Create: `community-pr-triage/src/fetcher.ts`
- Create: `community-pr-triage/src/__tests__/fetcher.test.ts`

**Step 1: Write failing tests for parsing/filtering logic**

`community-pr-triage/src/__tests__/fetcher.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { parseIssueRefs, isCommunityAuthor, parseCIStatus, extractArea } from '../fetcher.js';

describe('parseIssueRefs', () => {
  it('extracts #12345 references', () => {
    expect(parseIssueRefs('Fixes #23161 and relates to #20870')).toEqual([23161, 20870]);
  });

  it('extracts "fixes #123" / "closes #123" patterns', () => {
    expect(parseIssueRefs('fixes #12345\ncloses #67890')).toEqual([12345, 67890]);
  });

  it('extracts full GitHub issue URLs', () => {
    expect(parseIssueRefs('See https://github.com/strapi/strapi/issues/23161')).toEqual([23161]);
  });

  it('deduplicates', () => {
    expect(parseIssueRefs('Fixes #123. Related: #123')).toEqual([123]);
  });

  it('ignores very small numbers', () => {
    expect(parseIssueRefs('See #12')).toEqual([]);
  });

  it('returns empty for no refs', () => {
    expect(parseIssueRefs('No issues here')).toEqual([]);
  });
});

describe('isCommunityAuthor', () => {
  it('filters internal authors', () => {
    expect(isCommunityAuthor('butcherZ')).toBe(false);
    expect(isCommunityAuthor('markkaylor')).toBe(false);
  });

  it('filters bots', () => {
    expect(isCommunityAuthor('app/dependabot')).toBe(false);
    expect(isCommunityAuthor('renovate[bot]')).toBe(false);
  });

  it('allows community authors', () => {
    expect(isCommunityAuthor('someContributor')).toBe(true);
  });
});

describe('parseCIStatus', () => {
  it('returns passing when all checks succeed', () => {
    const checks = [
      { status: 'COMPLETED', conclusion: 'SUCCESS' },
      { status: 'COMPLETED', conclusion: 'SUCCESS' },
    ];
    expect(parseCIStatus(checks)).toBe('passing');
  });

  it('returns failing when any check fails', () => {
    const checks = [
      { status: 'COMPLETED', conclusion: 'SUCCESS' },
      { status: 'COMPLETED', conclusion: 'FAILURE' },
    ];
    expect(parseCIStatus(checks)).toBe('failing');
  });

  it('returns pending when checks are in progress', () => {
    expect(parseCIStatus([{ status: 'IN_PROGRESS', conclusion: null }])).toBe('pending');
  });

  it('returns pending for empty checks', () => {
    expect(parseCIStatus([])).toBe('pending');
  });
});

describe('extractArea', () => {
  it('extracts area from source: label', () => {
    expect(extractArea(['source: core:content-manager', 'pr: fix'])).toBe('content-manager');
  });

  it('extracts area from plugin label', () => {
    expect(extractArea(['source: plugin:i18n'])).toBe('i18n');
  });

  it('extracts from source: dependencies', () => {
    expect(extractArea(['source: dependencies'])).toBe('dependencies');
  });

  it('returns unknown for no source label', () => {
    expect(extractArea(['pr: fix'])).toBe('unknown');
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
cd community-pr-triage && npx vitest run src/__tests__/fetcher.test.ts
```

Expected: FAIL — module not found.

**Step 3: Implement fetcher**

`community-pr-triage/src/fetcher.ts`:

Note: uses `execFileSync('gh', [...args])` — no shell, arguments are arrays, safe from injection.

```typescript
import { execFileSync } from 'node:child_process';
import { REPO, INTERNAL_AUTHORS, BOT_PATTERNS } from './config.js';
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

export function isCommunityAuthor(author: string): boolean {
  if (INTERNAL_AUTHORS.includes(author)) return false;
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

export async function fetchCommunityPRs(): Promise<GitHubPR[]> {
  const fields = [
    'number', 'title', 'author', 'body', 'labels', 'additions', 'deletions',
    'changedFiles', 'createdAt', 'state', 'isDraft', 'mergedAt', 'closedAt',
    'statusCheckRollup',
  ].join(',');

  const raw = gh(['pr', 'list', '--repo', REPO, '--state', 'open', '--limit', '200', '--json', fields]);
  const prs = JSON.parse(raw) as Array<Record<string, any>>;

  return prs
    .filter((pr) => isCommunityAuthor(pr.author.login))
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
```

**Step 4: Run tests to verify they pass**

```bash
cd community-pr-triage && npx vitest run src/__tests__/fetcher.test.ts
```

Expected: all PASS.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add GitHub data fetcher with gh CLI and parsing helpers"
```

---

## Task 4: Reporter — Terminal Output

**Files:**
- Create: `community-pr-triage/src/reporter.ts`
- Create: `community-pr-triage/src/__tests__/reporter.test.ts`

**Step 1: Write failing tests**

`community-pr-triage/src/__tests__/reporter.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { groupByPriority, formatStats } from '../reporter.js';
import type { ScoredPR } from '../types.js';

const makeScoredPR = (overrides: Partial<ScoredPR> = {}): ScoredPR => ({
  pr: {
    number: 1, title: 'test', author: 'user', body: '', labels: ['pr: fix'],
    additions: 10, deletions: 5, changedFiles: 1, createdAt: new Date().toISOString(),
    state: 'open', isDraft: false, mergedAt: null, closedAt: null, ciStatus: 'passing',
  },
  linkedIssues: [],
  value: { base: 30, severity: 0, status: 0, engagement: 0, urgency: 1.0, total: 30 },
  complexity: 'low',
  priority: 'low',
  area: 'admin',
  areaTier: 'medium',
  prType: 'fix',
  isQuickWin: true,
  ...overrides,
});

describe('groupByPriority', () => {
  it('groups PRs into priority tiers', () => {
    const prs = [
      makeScoredPR({ priority: 'urgent' }),
      makeScoredPR({ priority: 'low' }),
      makeScoredPR({ priority: 'urgent' }),
      makeScoredPR({ priority: 'high' }),
    ];
    const grouped = groupByPriority(prs);
    expect(grouped.urgent).toHaveLength(2);
    expect(grouped.high).toHaveLength(1);
    expect(grouped.normal).toHaveLength(0);
    expect(grouped.low).toHaveLength(1);
  });
});

describe('formatStats', () => {
  it('returns summary stats string', () => {
    const prs = [
      makeScoredPR({ isQuickWin: true }),
      makeScoredPR({ isQuickWin: false, complexity: 'high' }),
    ];
    const stats = formatStats(prs);
    expect(stats).toContain('2 community PRs');
    expect(stats).toContain('1 quick win');
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
cd community-pr-triage && npx vitest run src/__tests__/reporter.test.ts
```

**Step 3: Implement reporter**

`community-pr-triage/src/reporter.ts`:
```typescript
import type { ScoredPR, PriorityTier } from './types.js';

type GroupedPRs = Record<PriorityTier, ScoredPR[]>;

export function groupByPriority(prs: ScoredPR[]): GroupedPRs {
  const groups: GroupedPRs = { urgent: [], high: [], normal: [], low: [] };
  for (const pr of prs) {
    groups[pr.priority].push(pr);
  }
  for (const tier of Object.keys(groups) as PriorityTier[]) {
    groups[tier].sort((a, b) => b.value.total - a.value.total);
  }
  return groups;
}

function sizeLabel(loc: number): string {
  if (loc < 50) return 'S';
  if (loc < 300) return 'M';
  if (loc < 1000) return 'L';
  return 'XL';
}

function formatPR(pr: ScoredPR): string {
  const loc = pr.pr.additions + pr.pr.deletions;
  const size = sizeLabel(loc);
  const qw = pr.isQuickWin ? ' | quick-win' : '';
  const header = `  #${pr.pr.number} [${pr.prType} | ${pr.area} | ${size}${qw}] ${pr.pr.title}`;

  const details: string[] = [];
  if (pr.linkedIssues.length > 0) {
    const issueRefs = pr.linkedIssues
      .map((li) => `#${li.issue.number} (${li.issue.thumbsUp} thumbs-up)`)
      .join(', ');
    details.push(`refs ${issueRefs}`);
  }
  details.push(`CI: ${pr.pr.ciStatus}`);
  const ageDays = Math.floor((Date.now() - new Date(pr.pr.createdAt).getTime()) / 86400000);
  details.push(`${ageDays}d old`);
  details.push(`Value: ${pr.value.total}`);

  return `${header}\n    ${details.join(' | ')}`;
}

export function formatStats(prs: ScoredPR[]): string {
  const quickWins = prs.filter((p) => p.isQuickWin).length;
  const stale = prs.filter((p) => {
    const age = (Date.now() - new Date(p.pr.createdAt).getTime()) / 86400000;
    return age > 60;
  }).length;
  return `Stats: ${prs.length} community PRs | ${quickWins} quick win${quickWins !== 1 ? 's' : ''} | ${stale} stale (>60d)`;
}

const TIER_HEADERS: Record<PriorityTier, string> = {
  urgent: 'URGENT', high: 'HIGH', normal: 'NORMAL', low: 'LOW',
};

export function printReport(prs: ScoredPR[]): void {
  const grouped = groupByPriority(prs);

  console.log('\n' + '='.repeat(70));
  console.log('  COMMUNITY PR TRIAGE REPORT');
  console.log('='.repeat(70) + '\n');

  for (const tier of ['urgent', 'high', 'normal', 'low'] as PriorityTier[]) {
    const items = grouped[tier];
    console.log(`${TIER_HEADERS[tier]} (${items.length} PRs)`);
    if (items.length === 0) {
      console.log('  (none)\n');
      continue;
    }
    for (const pr of items) {
      console.log(formatPR(pr));
    }
    console.log();
  }

  const quickWins = prs.filter((p) => p.isQuickWin).sort((a, b) =>
    (a.pr.additions + a.pr.deletions) - (b.pr.additions + b.pr.deletions)
  );
  console.log(`QUICK WINS (${quickWins.length} PRs)`);
  if (quickWins.length === 0) {
    console.log('  (none)\n');
  } else {
    for (const pr of quickWins) {
      const loc = pr.pr.additions + pr.pr.deletions;
      console.log(`  #${pr.pr.number} [${pr.prType} | ${pr.area} | ${loc} LOC] ${pr.pr.title}`);
    }
    console.log();
  }

  console.log(formatStats(prs));
  console.log();
}
```

**Step 4: Run tests to verify they pass**

```bash
cd community-pr-triage && npx vitest run src/__tests__/reporter.test.ts
```

Expected: all PASS.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add terminal reporter with priority grouping and quick wins"
```

---

## Task 5: Linear Syncer

**Files:**
- Create: `community-pr-triage/src/syncer.ts`
- Create: `community-pr-triage/src/__tests__/syncer.test.ts`

**Step 1: Write failing tests for pure helpers**

`community-pr-triage/src/__tests__/syncer.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { matchPRNumber, mapPriorityToLinear, mapLabelsToLinear, buildDescription } from '../syncer.js';
import type { ScoredPR } from '../types.js';

describe('matchPRNumber', () => {
  it('extracts PR number from Linear issue title', () => {
    expect(matchPRNumber('PR #25123: Fix drag-and-drop')).toBe(25123);
  });
  it('returns null for non-matching title', () => {
    expect(matchPRNumber('Some random issue')).toBeNull();
  });
});

describe('mapPriorityToLinear', () => {
  it('maps urgent to 1', () => expect(mapPriorityToLinear('urgent')).toBe(1));
  it('maps high to 2', () => expect(mapPriorityToLinear('high')).toBe(2));
  it('maps normal to 3', () => expect(mapPriorityToLinear('normal')).toBe(3));
  it('maps low to 4', () => expect(mapPriorityToLinear('low')).toBe(4));
});

describe('mapLabelsToLinear', () => {
  it('maps pr: fix to Bug label ID', () => {
    const ids = mapLabelsToLinear(['pr: fix', 'source: core:admin']);
    expect(ids).toContain('a850ce54-33cd-4917-a06a-4d2df6dafab2');
    expect(ids).toHaveLength(1);
  });
  it('returns empty for unmapped labels', () => {
    expect(mapLabelsToLinear(['some-random-label'])).toEqual([]);
  });
});

describe('buildDescription', () => {
  it('includes PR link, author, and quick win status', () => {
    const desc = buildDescription({
      pr: {
        number: 123, title: 'test', author: 'contributor', body: '',
        labels: ['pr: fix'], additions: 10, deletions: 5, changedFiles: 1,
        createdAt: '2026-01-01T00:00:00Z', state: 'open', isDraft: false,
        mergedAt: null, closedAt: null, ciStatus: 'passing',
      },
      linkedIssues: [],
      value: { base: 30, severity: 0, status: 0, engagement: 0, urgency: 1.0, total: 30 },
      complexity: 'low', priority: 'low', area: 'admin', areaTier: 'medium',
      prType: 'fix', isQuickWin: true,
    } as ScoredPR);
    expect(desc).toContain('@contributor');
    expect(desc).toContain('github.com/strapi/strapi/pull/123');
    expect(desc).toContain('Quick Win: Yes');
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
cd community-pr-triage && npx vitest run src/__tests__/syncer.test.ts
```

**Step 3: Implement syncer**

`community-pr-triage/src/syncer.ts`:
```typescript
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
}> {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) throw new Error('LINEAR_API_KEY environment variable is required');

  const client = new LinearClient({ apiKey });
  const stats = { created: 0, updated: 0, closed: 0 };

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
      stats.updated++;
    } else {
      await client.createIssue({
        teamId: LINEAR_TEAM_ID,
        title: `PR #${scored.pr.number}: ${scored.pr.title}`,
        description,
        priority: linearPriority,
        stateId: LINEAR_STATUSES.triage,
        labelIds,
      });
      stats.created++;
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
```

**Step 4: Run tests to verify they pass**

```bash
cd community-pr-triage && npx vitest run src/__tests__/syncer.test.ts
```

Expected: all PASS.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Linear syncer with issue create/update/close"
```

---

## Task 6: CLI Entry Point — Wire Everything Together

**Files:**
- Create: `community-pr-triage/src/index.ts`

**Step 1: Implement the CLI entry point**

`community-pr-triage/src/index.ts`:
```typescript
import 'dotenv/config';
import { AREA_TIERS } from './config.js';
import { fetchCommunityPRs, fetchIssue, parseIssueRefs, parseLinkedIssueData, extractArea } from './fetcher.js';
import { calculateValue, calculateComplexity, calculatePriority, isQuickWin } from './scorer.js';
import { syncToLinear } from './syncer.js';
import { printReport } from './reporter.js';
import type { ScoredPR, LinkedIssueData } from './types.js';

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
  const dryRun = process.argv.includes('--dry-run');

  console.log('Fetching community PRs from GitHub...');
  const prs = await fetchCommunityPRs();
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
    const area = extractArea(pr.labels);
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

  if (dryRun) {
    console.log('[DRY RUN] Skipping Linear sync.\n');
  } else {
    console.log('Syncing to Linear...');
    const stats = await syncToLinear(scoredPRs);
    console.log(`Linear sync complete: ${stats.created} created, ${stats.updated} updated, ${stats.closed} closed.\n`);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
```

**Step 2: Test dry-run locally**

```bash
cd community-pr-triage && npx tsx src/index.ts --dry-run
```

Expected: fetches PRs, prints scored report, skips Linear sync.

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add CLI entry point wiring all components"
```

---

## Task 7: End-to-End Verification

**Step 1: Set up&#32;`.env`**

```bash
cd community-pr-triage && cp .env.example .env
# Add your LINEAR_API_KEY to .env
```

**Step 2: Run full sync**

```bash
npx tsx src/index.ts
```

Expected: report prints, Linear issues created in `CMS-Community-PRs`.

**Step 3: Verify in Linear** — check titles, priorities, labels, descriptions.

**Step 4: Run again** — verify idempotent (`0 created, N updated, 0 closed`).

**Step 5: Run all unit tests**

```bash
npx vitest run
```

Expected: all pass.

**Step 6: Final commit**

```bash
git add -A
git commit -m "chore: add .gitignore, verify e2e sync"
```

---

## Task Summary

| Task | What | Estimated |
| --- | --- | --- |
| 1 | Project scaffolding (package.json, types, config) | 5 min |
| 2 | Scorer (value + complexity + tests) | 10 min |
| 3 | Fetcher (gh CLI + parsing + tests) | 10 min |
| 4 | Reporter (terminal output + tests) | 10 min |
| 5 | Linear syncer (API + tests) | 10 min |
| 6 | CLI entry point | 5 min |
| 7 | E2E verification | 5 min |
