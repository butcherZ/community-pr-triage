import 'dotenv/config';
import { createInterface } from 'node:readline';
import { AREA_TIERS } from './config.js';
import { fetchInternalAuthors, fetchCommunityPRs, fetchIssue, parseIssueRefs, parseLinkedIssueData, extractArea } from './fetcher.js';
import { calculateValue, calculateComplexity, calculatePriority, isQuickWin } from './scorer.js';
import { syncToLinear } from './syncer.js';
import { printReport, generateMarkdownReport } from './reporter.js';
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
  const dryRun = process.argv.includes('--dry-run');

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

  // Generate markdown report
  const reportPath = `reports/triage-${new Date().toISOString().split('T')[0]}.md`;
  generateMarkdownReport(scoredPRs, reportPath);
  console.log(`Markdown report saved to: ${reportPath}\n`);

  if (dryRun) {
    console.log('[DRY RUN] Skipping Linear sync.\n');
  } else {
    const confirmed = await confirm(`About to sync ${scoredPRs.length} PRs to Linear. Proceed? (y/N) `);
    if (!confirmed) {
      console.log('Sync canceled.\n');
      return;
    }
    console.log('Syncing to Linear...');
    const stats = await syncToLinear(scoredPRs);
    console.log(`Linear sync complete: ${stats.created} created, ${stats.updated} updated, ${stats.closed} closed, ${stats.relationsCreated} relations linked.\n`);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
