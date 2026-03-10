# Community PR Triage — How It Works

## Overview

This tool automatically scores, prioritizes, and syncs community pull requests from `strapi/strapi` into Linear for the core team to review. It runs as a GitHub Action on a weekly schedule or on-demand, and can also be run locally.

---

## Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                        TRIGGER                                  │
│  Schedule (Monday 9am UTC)  ·  Manual dispatch  ·  Local CLI   │
└──────────────────────────────┬──────────────────────────────────┘
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│  1. FETCH DATA                                                   │
│                                                                  │
│  ┌──────────────┐    ┌───────────────────┐    ┌──────────────┐  │
│  │ Org members  │    │ Open PRs (gh CLI) │    │ CI statuses  │  │
│  │ (48 authors) │    │ 500 limit, --json │    │ (GraphQL)    │  │
│  └──────┬───────┘    └────────┬──────────┘    └──────┬───────┘  │
│         │                     │                      │          │
│         └─────────┬───────────┘──────────────────────┘          │
│                   ▼                                              │
│         Filter: community only                                   │
│         (exclude org members, bots, drafts)                      │
└──────────────────────────────┬───────────────────────────────────┘
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│  2. ENRICH EACH PR                                               │
│                                                                  │
│  PR body ──► parseIssueRefs() ──► fetchIssue() for each ref     │
│                                                                  │
│  For each linked issue, extract:                                 │
│    • severity (critical / high / medium / low)                   │
│    • status (confirmed / pending_repro / cant_repro)             │
│    • engagement (thumbs-up count, comment count)                 │
│                                                                  │
│  Determine area:                                                 │
│    1. Check labels for `source:` tag  ──► "content-manager"      │
│    2. If unknown, estimate from changed file paths:              │
│       packages/core/<name>/...  or  packages/plugins/<name>/... │
│       ──► most frequent package name wins                        │
└──────────────────────────────┬───────────────────────────────────┘
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│  3. SCORE & CLASSIFY                                             │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │  VALUE SCORE                                            │     │
│  │                                                         │     │
│  │  base (by PR type):                                     │     │
│  │    fix=30, feature=20, enhancement=20,                  │     │
│  │    chore=10, doc=15, deps=5                             │     │
│  │                                                         │     │
│  │  + severity bonus (critical=50, high=35, med=20, low=5) │     │
│  │  + status bonus (confirmed=15, pending=5)               │     │
│  │  + engagement (min(thumbsUp*2 + comments, 40))          │     │
│  │                                                         │     │
│  │  × urgency multiplier (by age):                         │     │
│  │    <7d=1.0, <30d=1.0, <90d=1.5, ≥90d=2.0              │     │
│  │                                                         │     │
│  │  total = (base + severity + status + engagement) × urg  │     │
│  └─────────────────────────────────────────────────────────┘     │
│                                                                  │
│  PRIORITY:   ≥100 urgent  ·  ≥70 high  ·  ≥50 normal  ·  <50 low│
│                                                                  │
│  COMPLEXITY:  by LOC + file count + area risk tier               │
│    low / medium / high / very_high                               │
│                                                                  │
│  QUICK WIN:   value ≥ 30 AND complexity = low                    │
└──────────────────────────────┬───────────────────────────────────┘
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│  4. REPORT                                                       │
│                                                                  │
│  • Console output grouped by priority tier                       │
│  • Markdown report saved to reports/triage-YYYY-MM-DD.md         │
│  • (GitHub Action) Written to job summary + uploaded as artifact  │
└──────────────────────────────┬───────────────────────────────────┘
                               ▼
                    ┌──── dry-run? ────┐
                    │                  │
                   YES                 NO
                    │                  │
                    ▼                  ▼
                  STOP        ┌────────────────┐
                              │ 5. LINEAR SYNC │
                              └───────┬────────┘
                                      ▼
┌──────────────────────────────────────────────────────────────────┐
│  5a. FETCH EXISTING LINEAR ISSUES                                │
│                                                                  │
│  Paginate all issues in the Linear team                          │
│  Build lookup: PR number → Linear issue ID                       │
│  (parsed from title pattern "PR #<number>: <title>")             │
└──────────────────────────────┬───────────────────────────────────┘
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│  5b. CREATE / UPDATE / CLOSE                                     │
│                                                                  │
│  For each scored PR:                                             │
│                                                                  │
│    ┌─ exists in Linear? ─────────────────────────────────┐       │
│    │                                                     │       │
│   YES                                                    NO      │
│    │                                                     │       │
│    ▼                                                     ▼       │
│  updateIssue()                                    createIssue()  │
│  • priority                                       • title        │
│  • description (scores,                           • description  │
│    linked issues, PR body)                        • priority     │
│  • labels                                         • labels       │
│                                                   • state=triage │
│                                                                  │
│  For PRs no longer open:                                         │
│    Merged PR → Linear state = done (completed)                   │
│    Closed PR → Linear state = canceled                           │
└──────────────────────────────┬───────────────────────────────────┘
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│  5c. ATTACH GITHUB PR                                            │
│                                                                  │
│  On creation, attach the GitHub PR URL to the Linear ticket      │
│  (shows as a clickable link with GitHub icon in the sidebar)     │
└──────────────────────────────┬───────────────────────────────────┘
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│  5d. LINK RELATIONS                                              │
│                                                                  │
│  For each PR with linked GitHub issues:                          │
│    1. Search all teams for issues mentioning the GitHub URL      │
│    2. Search CMS-Github team for issues with matching            │
│       attachment URL (synced GitHub issues)                      │
│    Create "related" relation if not already linked               │
│    (deduplicates by checking existing relations first)           │
└──────────────────────────────────────────────────────────────────┘
```

---

## What Gets Synced to Each Linear Ticket

| Field | Source |
|-------|--------|
| **Title** | `PR #<number>: <PR title>` |
| **Priority** | Mapped from score: urgent→1, high→2, normal→3, low→4 |
| **Description** | Author, area, type, size, age, CI status, linked issues with severity, value/complexity scores, PR body (truncated to 2000 chars), GitHub link |
| **Labels** | PR type (Bug, Feature, etc.) + priority tier + complexity tier + CI status + quick win flag |
| **Relations** | Linked to Linear issues that correspond to referenced GitHub issues |

---

## Labels Applied to Linear Tickets

```
┌─────────────────────────────────────────────────────┐
│  PR Type         Priority        Complexity          │
│  ─────────       ────────        ──────────          │
│  Bug             Urgent          Low                 │
│  Feature         High            Medium              │
│  Enhancement     Normal          High                │
│  Chore           Low             Very High           │
│  Documentation                                       │
│                  CI Status       Special              │
│                  ─────────       ───────              │
│                  Passing         Quick Win            │
│                  Failing                              │
│                  Pending                              │
└─────────────────────────────────────────────────────┘
```

---

## Idempotency

The sync is safe to run repeatedly:

- **Existing PRs** are updated in-place (matched by `PR #<number>:` in the Linear issue title)
- **New PRs** get new Linear issues created
- **Merged PRs** have their Linear issues set to "done" (completed)
- **Closed PRs** (not merged) have their Linear issues set to "canceled"
- **Relations** are deduplicated — existing relations are checked before creating new ones

---

## Area Detection

Two-pass strategy:

1. **Labels first** — look for `source: core:<area>` or `source: plugin:<area>` GitHub labels
2. **File paths fallback** — if no label, parse changed file paths matching `packages/core/<name>/` or `packages/plugins/<name>/`, return the most frequent package name

This reduces "unknown" areas for PRs that lack `source:` labels but touch recognizable package directories.

---

## Running

### GitHub Action (automated)

- **Weekly** (Monday 9am UTC): dry-run only (report, no sync)
- **Manual dispatch**: set `sync: true` to push to Linear

### Local

```bash
cd community-pr-triage
pnpm dry-run          # report only
pnpm start            # report + interactive confirmation + Linear sync
```

Requires:
- `gh` CLI authenticated with access to `strapi/strapi`
- `.env` with `LINEAR_API_KEY` (only for sync mode)
