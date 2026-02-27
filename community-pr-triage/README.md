# Community PR Triage

CLI tool that fetches open community PRs from [strapi/strapi](https://github.com/strapi/strapi), scores them by value and complexity, prints a prioritized triage report, and syncs issues to Linear.

## Prerequisites

- Node.js 18+
- [GitHub CLI (`gh`)](https://cli.github.com/) — authenticated with access to `strapi/strapi`
- [pnpm](https://pnpm.io/)
- A [Linear API key](https://linear.app/settings/api) (for sync mode only)

## Setup

```bash
pnpm install
cp .env.example .env
# Edit .env and add your LINEAR_API_KEY
```

## Usage

### Dry run (report only, no Linear sync)

```bash
pnpm dry-run
```

This fetches all open community PRs, scores them, and prints a prioritized report to the terminal. No data is written to Linear.

### Full run (report + Linear sync)

```bash
pnpm start
```

This does everything the dry run does, plus creates/updates/closes Linear issues in the `CMS-Community-PRs` team to match the current state of open community PRs.

## How it works

1. **Fetch** — Uses `gh` CLI to list open PRs from `strapi/strapi` and fetches org members from the Strapi GitHub org to filter out internal authors and bots
2. **Score** — Each PR gets a value score based on type (fix, feature, etc.), linked issue severity, community engagement, and age. Complexity is derived from LOC, file count, and area risk tier
3. **Prioritize** — Value score maps to priority tiers: urgent (100+), high (70-99), normal (50-69), low (<50). Low-complexity PRs with value >= 30 are flagged as quick wins
4. **Report** — Prints a grouped report to the terminal showing PRs by priority tier, plus a quick wins section and summary stats
5. **Sync** — Creates new Linear issues for new PRs, updates existing ones, and cancels issues for PRs that are no longer open

## Testing

```bash
pnpm test          # single run
pnpm test:watch    # watch mode
```
