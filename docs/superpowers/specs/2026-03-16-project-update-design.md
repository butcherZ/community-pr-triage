# Project Update Command — Design Spec

## Problem

The current tool syncs community PRs to Linear and optionally posts sprint recommendations, but lacks a way to generate progress reports. When devs pick up a PR, they transfer the ticket from the CPR team to CMS, making it invisible to the current CPR-scoped queries. There is also a duplicate creation bug: `syncToLinear` only searches the CPR team for existing tickets, so transferred tickets get re-created.

## Goals

1. **Fix duplicate creation bug** — search CMS, CPR, and CMS-Github teams when checking for existing tickets, and skip updating tickets that have been transferred to CMS.
2. **Add a project update command** — a standalone command that compares Linear state against GitHub state and generates a progress report.
3. **Output to both markdown and Linear** — save report to `reports/` and post as a Linear project update.
4. **Support CLI and GitHub Action** — runnable manually and on a schedule.

## Non-Goals

- Tracking metrics/trends over time (e.g., charts, historical data)
- Sprint recommendation (already handled by `--sprint-update`)
- AI-powered relation discovery (separate feature)

## Design

### Part 1: Rename `LINEAR_TEAM_ID` to `LINEAR_CPR_TEAM_ID` and add `LINEAR_CMS_TEAM_ID`

**Config changes (`src/config.ts`):**
- Rename `LINEAR_TEAM_ID` env var to `LINEAR_CPR_TEAM_ID`
- Add `LINEAR_CMS_TEAM_ID` env var
- Update all references across the codebase (`syncer.ts`, `sprint.ts`, `ai-relations.ts`)
- Update GitHub Action workflow and action.yml with the new env var names
- Add `LINEAR_CMS_TEAM_ID` secret to the workflow

**Team IDs:**
| Team | ID |
|------|-----|
| CMS | `75301c65-b974-417d-9edf-5179f3156e8e` |
| CMS-Community-PRs (CPR) | `a545ae90-ba50-4427-83e6-c0ce7dde9528` |
| CMS-Github | `0267eb6f-430a-451b-a8fb-5d1bf0ebb247` |

### Part 2: Fix duplicate creation for transferred tickets

**File: `src/syncer.ts` — `syncToLinear()`**

Change the existing issues lookup (currently `client.issues` filtered by CPR team) to search across CMS, CPR, and CMS-Github teams:

```
for each team in [CPR, CMS, CMS-Github]:
  fetch all issues matching PR # pattern
  store with team ID
```

When processing each scored PR:
- If ticket exists **in CPR team** → update as before (description, labels, status)
- If ticket exists **in CMS team** → skip update entirely (CMS team owns it now)
- If ticket exists **in CMS-Github team** → skip (these are GitHub issue trackers, not PR tickets)
- If no ticket found → create in CPR team

This prevents duplicates when a ticket has been transferred from CPR to CMS.

### Part 3: Project update command

**New file: `src/project-update.ts`**

#### Data collection

1. **GitHub state**: Reuse `fetchCommunityPRs()` and `fetchRecentlyMergedPRNumbers()` from `fetcher.ts`
2. **Linear state**: Search CMS and CPR teams for all `PR #` tickets, recording:
   - PR number (parsed from title)
   - Current team (CMS or CPR)
   - Current status (stateType: triage, todo, inProgress, done, canceled, etc.)
   - Issue identifier (e.g., CMS-341, CPR-6)
   - Issue URL

#### Diff categories

Compare GitHub open PRs against Linear tickets:

| Category | Condition | Description |
|----------|-----------|-------------|
| **Picked Up** | Ticket in CMS team, status not done/canceled | Transferred to CMS, being worked on |
| **Merged** | PR merged (in mergedPRNumbers) | PR successfully merged |
| **Closed** | PR closed but not merged, ticket exists | PR abandoned/rejected |
| **In Progress** | Ticket in CPR team, status beyond todo | Being worked on but not yet transferred |
| **New** | Open PR on GitHub, no Linear ticket | Awaiting next sync |
| **Stale** | Ticket in CPR team, status = todo, age > 14 days | No progress, needs attention |

#### Output format

```markdown
## Community PR Project Update — YYYY-MM-DD

### Summary
- X open community PRs tracked
- X merged since last sync
- X picked up by CMS team
- X new PRs awaiting triage
- X stale (>14 days in Todo)

### Picked Up (transferred to CMS)
- PR #25279: fix content-manager over-population (CMS-341, Done)
- PR #25277: fix content-manager localization (CMS-XXX, In Review)

### Merged
- PR #25279: fix content-manager over-population

### In Progress (CPR team)
- PR #XXXXX: ... (CPR-XX, In Progress)

### New (not yet synced)
- PR #XXXXX: feat: add webhook retry logic

### Closed (not merged)
- PR #XXXXX: refactor: remove legacy auth

### Stale (>14 days in Todo)
- PR #XXXXX: fix: media library upload (36 days, CPR-XX)
```

#### Functions

**Pure functions (unit-testable):**
- `categorizeTickets(scoredPRs, mergedPRNumbers, linearTickets)` — returns categorized diff
- `formatProjectUpdate(categories, totalPRs)` — returns markdown string

**I/O functions:**
- `fetchLinearTickets(client)` — searches CMS + CPR teams for PR tickets
- `postProjectUpdate(scoredPRs, mergedPRNumbers)` — orchestrates: fetch Linear state, diff, format, save report, post to Linear

### Part 4: CLI integration

**`src/index.ts` changes:**
- Add `--project-update` flag parsing
- When set: run data fetching + scoring, then call `postProjectUpdate()`
- In dry-run mode: generate and display the report but skip posting to Linear

**`package.json` scripts:**
```json
"project-update": "tsx src/index.ts --project-update",
"project-update:dry": "tsx src/index.ts --dry-run --project-update"
```

### Part 5: GitHub Action

**`action.yml` changes:**
- Add `project-update` input (boolean, default false)

**Workflow changes (`.github/workflows/community-pr-triage.yml`):**
- Add `project-update` to workflow_dispatch inputs
- Pass `LINEAR_CMS_TEAM_ID` secret
- Rename `LINEAR_TEAM_ID` to `LINEAR_CPR_TEAM_ID`
- Optionally add a scheduled run for project updates (same biweekly Tuesday, or a different schedule)

## Testing

- Unit tests for `categorizeTickets()` and `formatProjectUpdate()` — these are pure functions
- Existing `syncer.test.ts` tests for `matchPRNumber`, `buildLabelIds`, `mergeLabelIds` remain unchanged
- Manual testing with `pnpm project-update:dry` to verify report output

## Migration

The rename of `LINEAR_TEAM_ID` → `LINEAR_CPR_TEAM_ID` is a breaking change for anyone using the env var. The GitHub Action secrets also need updating. This should be called out in the commit message.
