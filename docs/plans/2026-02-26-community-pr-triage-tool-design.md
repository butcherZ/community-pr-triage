# Community PR Triage Tool — Design

**Status**: Approved
**RFC**: [Community PRs workflow](https://www.notion.so/strapi/Community-PRs-workflow-2fd8f359807480358be4f05f8d002a8c)
**Date**: 2026-02-26

## Summary

A TypeScript CLI tool that fetches open community PRs from `strapi/strapi` using `gh` CLI, scores them by value and complexity, syncs them to Linear (`CMS-Community-PRs` team), and prints a prioritized report for bi-weekly review sessions.

## Architecture

```
┌─────────────┐     ┌──────────────────────────┐     ┌────────┐
│   n8n        │────▶│  TypeScript CLI           │────▶│ Linear │
│  (scheduler) │     │  (community-pr-triage/)   │     │  API   │
└─────────────┘     └──────────┬───────────────┘     └────────┘
                               │
                               ▼
                        ┌────────────┐
                        │  gh CLI    │
                        │  (GitHub)  │
                        └────────────┘
```

**Hosting**: butcherZ's GitHub account.

## Components

### 1. Data Fetcher (`fetcher.ts`)

- Shells out to `gh` CLI (`gh pr list`, `gh api`) — no octokit dependency needed
- Targets `strapi/strapi` only (for now)
- Filters out internal team authors (configurable allowlist) and bots
- For each PR, fetches: labels, size (additions/deletions/files), CI status, body text
- Parses PR body for issue references using regex:
  - `#12345`, `fixes #12345`, `closes #12345`, `resolves #12345`
  - Full GitHub issue URLs
- For each linked issue, fetches reaction counts, comment counts, and labels (severity/status)

### 2. Scorer (`scorer.ts`)

Dual scoring: **Value** (how important) and **Complexity** (how hard to review).

#### Value Score (from RFC)

```
Value = (Base + Severity + Status + Engagement) × Urgency
```

| Factor | Signal | Points |
|--------|--------|--------|
| **Base** (PR type) | Bug fix | 30 |
| | Enhancement | 20 |
| | Docs | 15 |
| | Refactor / feature | 10 |
| | Dependencies | 5 |
| **Severity** (linked issue labels) | Critical | +50 |
| | High | +35 |
| | Medium | +20 |
| | Low | +5 |
| | None | +0 |
| **Status** (linked issue labels) | Confirmed | +15 |
| | Pending repro | +5 |
| | Can't repro | -10 |
| **Engagement** (capped +40) | Each thumbs-up on issue/PR | +1 |
| | Each comment | +0.5 |
| | Bonus at 10+ reactions | +5 |
| | Bonus at 20+ reactions | +10 |
| | Bonus at 50+ reactions | +15 |
| **Urgency** (age multiplier) | 0-7 days | x1.0 |
| | 8-14 days | x1.2 |
| | 15-21 days | x1.4 |
| | 22-30 days | x1.6 |
| | 31-45 days | x1.8 |
| | 46+ days | x2.0 |

#### Complexity Score

| Signal | Complexity |
|--------|-----------|
| < 50 LOC, <= 3 files | Low |
| 50-300 LOC, <= 10 files | Medium |
| 300-1000 LOC | High |
| > 1000 LOC | Very High |

Area risk adjusts complexity upward:
- Critical areas (database, core strapi): +1 tier
- High areas (content-manager, upload, users-permissions): no change
- Medium areas (admin, content-type-builder, i18n): no change
- Low areas (docs, graphql, typescript, dependencies): -1 tier

#### Quick Win Detection

A PR is a **quick win** if: `Value >= 30 AND Complexity = Low`

### 3. Linear Syncer (`syncer.ts`)

Uses `@linear/sdk` to sync to the `CMS-Community-PRs` team (ID: `a545ae90-ba50-4427-83e6-c0ce7dde9528`).

**Matching**: by PR number in title pattern `PR #XXXXX:`

**Create** (new PR, no matching Linear issue):
- Title: `PR #25123: Fix drag-and-drop preview in dynamic zones`
- Status: `Triage` (ID: `cf0651ff-654a-464e-893b-bb18af7053e5`)
- Priority: mapped from Value score
- Labels: mapped from GitHub `pr:*` labels
- Assignee: none

**Update** (existing PR, Linear issue exists):
- Refresh priority, description, labels if changed
- Merged PR -> status `Done` (ID: `c82d01d6-921f-4774-8031-584b1be9fc63`)
- Closed without merge -> status `Canceled` (ID: `79faca9e-011b-422a-b8cc-d41dcab6f8cd`)

**Priority mapping**:

| Value Score | Linear Priority |
|-------------|----------------|
| 100+ | Urgent (1) |
| 70-99 | High (2) |
| 50-69 | Normal (3) |
| < 50 | Low (4) |

**Label mapping**:

| GitHub label | Linear label |
|-------------|-------------|
| `pr: fix` | Bug (`a850ce54`) |
| `pr: feature` | Feature (`5e7646f1`) |
| `pr: enhancement` | Enhancement (`54d83c27`) |
| `pr: chore` | Chore (`f0230cb8`) |
| `pr: doc` | Doc (`6711572b`) |

### 4. Reporter (`reporter.ts`)

Terminal output grouped by priority tier, with a dedicated quick wins section.

```
URGENT (3 PRs)
  #25123 [fix | content-manager | S | quick-win] Fix drag-and-drop preview
    refs #23161 (24 thumbs-up) | CI: passing | 51d old | Value: 162

HIGH (8 PRs)
  ...

NORMAL (20 PRs)
  ...

LOW (15 PRs)
  ...

QUICK WINS (12 PRs)
  #25006 [fix | admin | 5 LOC] Remove @ts-expect-error in useQueryParams
  #25011 [fix | core | 3 LOC] maxFileSize error not detected
  ...

Stats: 46 community PRs | 12 quick wins | 5 stale (>60d) | 3 approved ready to merge
```

### Linear Issue Description Template

```markdown
**Author**: @Rowan-Paul
**Area**: content-manager (High risk tier)
**Type**: Bug fix | **Size**: S (45 LOC, 2 files)
**Age**: 51 days | **CI**: Passing

### Linked Issues
- #23161 — Drag&Drop broken in Configure View (24 thumbs-up, 23 comments)
  severity: high, status: confirmed

### Scores
Value: (Base:30 + Severity:35 + Status:15 + Engagement:28) x Urgency:1.8 = 162 -> Urgent
Complexity: Low (45 LOC, 2 files, high-risk area)
Quick Win: Yes

[View PR on GitHub](https://github.com/strapi/strapi/pull/25123)
```

## CLI Interface

```bash
# Full run: fetch, score, sync to Linear, print report
npx community-pr-triage

# Dry run: print report only, no Linear sync
npx community-pr-triage --dry-run
```

## Configuration

Environment variables:

```
LINEAR_API_KEY=...         # Linear API key
```

`gh` CLI uses existing auth — no GitHub token needed.

Hardcoded config (`config.ts`):

```typescript
export const REPO = 'strapi/strapi'

export const INTERNAL_AUTHORS = [
  'butcherZ', 'mathildeleg', 'nclsndr', 'markkaylor',
  'Adzouz', 'innerdvations', 'derrickmehaffy', 'Bassel17',
  'alex-strapi', 'remidej', 'PaulBratslavsky', 'unrevised6419',
  'jhoward1994', 'HichamELBSI'
]

export const BOT_PATTERNS = ['[bot]', 'app/dependabot', 'renovate']

export const AREA_TIERS = {
  critical: ['database', 'strapi'],
  high: ['content-manager', 'upload', 'users-permissions'],
  medium: ['admin', 'content-type-builder', 'i18n'],
  low: ['documentation', 'graphql', 'typescript', 'dependencies']
}

export const LINEAR_TEAM_ID = 'a545ae90-ba50-4427-83e6-c0ce7dde9528'
```

## Sync Behavior

- **Every run**: fetches all open community PRs, scores them, syncs to Linear.
- **First run**: scores existing backlog retroactively. No stale reminders on pre-existing PRs.
- **New PRs**: created in `Triage` status.
- **Merged/closed PRs**: moved to `Done`/`Canceled`.
- **Stale reminders**: Linear-side only (comments on Linear issue, not GitHub). Human reviewers communicate with contributors directly.

## File Structure

```
community-pr-triage/
  src/
    index.ts          # CLI entry point
    fetcher.ts        # gh CLI calls for GitHub data
    scorer.ts         # Value + complexity scoring
    syncer.ts         # Linear SDK sync
    reporter.ts       # Terminal output
    config.ts         # Authors, area tiers, weights
    types.ts          # Shared types
  package.json        # @linear/sdk, tsx
  tsconfig.json
  .env.example
  README.md
```

## Key Design Decisions (from RFC feedback)

1. **No bot messages on GitHub** — stale reminders stay internal in Linear (Bassel, Ziyi, Nico consensus)
2. **Quick win detection** — dual value/complexity scoring prevents losing easy PRs (innerdvations, Bassel)
3. **`community` label, not `source: community`** — avoids conflict with codebase area labels (innerdvations, Adzouz)
4. **Severity from issue labels** — derived from existing `severity:*` GitHub labels (nclsndr)
5. **Retroactive scoring, no retroactive reminders** — first run scores backlog without spam (nclsndr)
6. **Phase 1 focus** — scoring + Linear sync. AI shallow-review for low-hanging fruit is Phase 2 (nclsndr)
7. **gh CLI over octokit** — simpler, already authenticated, no extra dependency
8. **strapi/strapi only** — keep scope tight, extend to other repos later
