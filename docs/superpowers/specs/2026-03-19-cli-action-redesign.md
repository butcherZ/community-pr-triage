# CLI & GitHub Action Interface Redesign

## Problem

The CLI flags and GitHub Action inputs evolved organically and are inconsistent. `--dry-run`, `--sprint-update`, `--project-update` interact in non-obvious ways. The tool does three things — triage report, sync, project update — but the interface doesn't make the combinations clear.

## Design

### Core operations

The tool has two write operations. The triage report (fetch, score, print) always runs as a prerequisite.

1. **Sync** — create/update/close Linear tickets based on scored PRs
2. **Update** — generate project update (status diff + sprint recommendation), post to Linear, create milestone, assign top PRs

Each can run independently or together. Each has a dry-run mode (preview only).

### CLI

**Scripts in `package.json`:**

| Command | Flags | What it does |
|---------|-------|-------------|
| `pnpm run sync` | `--sync` | Fetch, score, preview sync stats, confirm, sync to Linear |
| `pnpm run sync:dry` | `--sync --dry-run` | Fetch, score, preview sync stats only |
| `pnpm run update` | `--update` | Fetch, score, generate project update, confirm, post to Linear |
| `pnpm run update:dry` | `--update --dry-run` | Fetch, score, generate project update report only |
| `pnpm run all` | `--sync --update` | Both operations (two confirmations) |
| `pnpm run all:dry` | `--sync --update --dry-run` | Preview everything |

All commands accept `-y` / `--yes` to skip confirmations.

**Behavior with no flags:** running `tsx src/index.ts` with no `--sync` or `--update` is equivalent to dry-run — fetches, scores, prints report, exits. Passing `--dry-run` alone has no additional effect over running with no flags.

**`package.json` scripts:**

```json
{
  "scripts": {
    "sync": "tsx src/index.ts --sync",
    "sync:dry": "tsx src/index.ts --sync --dry-run",
    "update": "tsx src/index.ts --update",
    "update:dry": "tsx src/index.ts --update --dry-run",
    "all": "tsx src/index.ts --sync --update",
    "all:dry": "tsx src/index.ts --sync --update --dry-run",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

### GitHub Action

Single workflow (`community-pr-triage.yml`) with a choice dropdown:

```yaml
on:
  schedule:
    - cron: '0 9 * * 1'  # Every Monday 9am UTC
  workflow_dispatch:
    inputs:
      action:
        description: 'What to run'
        type: choice
        default: 'dry-run'
        options:
          - dry-run
          - sync
          - update
          - sync + update
```

**Schedule** runs as `dry-run` (no `inputs.action` is set on schedule triggers).

**Mapping dropdown to flags:**

| Selection | `--sync` | `--update` | `--dry-run` |
|-----------|----------|-----------|-------------|
| `dry-run` | No | No | Yes |
| `sync` | Yes | No | No |
| `update` | No | Yes | No |
| `sync + update` | Yes | Yes | No |

The action always passes `-y` (no interactive prompts in CI).

**Action inputs (`action.yml`):**

```yaml
inputs:
  dry-run:
    description: 'Preview only, no writes to Linear'
    default: 'true'
  sync:
    description: 'Sync tickets to Linear'
    default: 'false'
  update:
    description: 'Post project update to Linear'
    default: 'false'
  pr-number:
    description: 'Single PR number to triage (skips full scan)'
    required: false
```

**Workflow step mapping:**

The `inputs.action` dropdown is empty string on schedule triggers, which maps to dry-run via the first condition.

```yaml
- name: Run triage
  uses: ./.github/actions/community-pr-triage
  with:
    dry-run: ${{ github.event_name == 'schedule' || inputs.action == 'dry-run' || inputs.action == '' }}
    sync: ${{ inputs.action == 'sync' || inputs.action == 'sync + update' }}
    update: ${{ inputs.action == 'update' || inputs.action == 'sync + update' }}
```

### Execution flow in `index.ts` / `index.action.ts`

```
1. Always: fetch PRs, score, print report
2. Always: show sibling PR preview
3. If LINEAR_API_KEY is set: fetch sync preview (new/existing/picked-up counts)
4. Always: generate triage markdown report (includes sync preview if available)
5. If --sync and not --dry-run: confirm → sync to Linear
6. If --sync and --dry-run: print "[DRY RUN] Skipping sync"
7. If --update and not --dry-run: confirm → post project update + milestone
8. If --update and --dry-run: generate update report, print, skip posting
9. Upload report artifacts
```

Note: the current `index.ts` syncs unconditionally unless `--dry-run` is set. This redesign changes that — sync now requires the explicit `--sync` flag. Without `--sync` or `--update`, the tool only reports.

### Files changed

These changes must be deployed atomically — the workflow and action.yml depend on each other.

- `src/index.ts` — remove default-sync behavior; gate sync behind `--sync` flag; replace `--project-update` with `--update`
- `src/index.action.ts` — replace `project-update` input with `sync` and `update` inputs; keep `pr-number` input
- `package.json` — replace all scripts with new naming
- `.github/actions/community-pr-triage/action.yml` — replace `project-update` input with `sync` and `update` inputs; keep `pr-number`
- `.github/workflows/community-pr-triage.yml` — replace boolean inputs with choice dropdown
- `README.md` — update commands and action documentation

### Removed

- `--sprint-update` flag (already removed)
- `--project-update` flag (replaced by `--update`)
- `project-update` action input (replaced by `update`)
- `sprint.ts` (already dead code, can be deleted)
- `pnpm start` / `pnpm dry-run` / `pnpm project-update` / `pnpm project-update:dry` scripts (replaced by new naming)
- `.github/workflows/community-pr-project-update.yml` (already removed, merged into single workflow)
