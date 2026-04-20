import { NOTION_API_KEY, NOTION_DATABASE_ID } from './config.js';
import type { ScoredPR } from './types.js';
import type { ProjectUpdateCategory } from './project-update.js';

const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

// --- Block type helpers ---

type RichText = {
  type: 'text';
  text: { content: string; link?: { url: string } };
  annotations?: { bold?: boolean };
};

type Block = Record<string, unknown>;

const t = (content: string, url?: string): RichText => ({
  type: 'text',
  text: url ? { content, link: { url } } : { content },
});

const h1 = (text: string): Block => ({
  object: 'block',
  type: 'heading_1',
  heading_1: { rich_text: [t(text)] },
});

const h2 = (text: string): Block => ({
  object: 'block',
  type: 'heading_2',
  heading_2: { rich_text: [t(text)] },
});

const h3 = (text: string): Block => ({
  object: 'block',
  type: 'heading_3',
  heading_3: { rich_text: [t(text)] },
});

const para = (text: string): Block => ({
  object: 'block',
  type: 'paragraph',
  paragraph: { rich_text: [t(text)] },
});

const div = (): Block => ({ object: 'block', type: 'divider', divider: {} });

const li = (...spans: RichText[]): Block => ({
  object: 'block',
  type: 'bulleted_list_item',
  bulleted_list_item: { rich_text: spans.filter((s) => s.text.content !== '') },
});

// --- Report block builder ---

export function buildNotionBlocks(
  scoredPRs: ScoredPR[],
  categories: ProjectUpdateCategory,
  sprintPRs: ScoredPR[],
  linearUrls: Map<number, string>
): Block[] {
  const date = new Date().toISOString().split('T')[0];
  const totalPRs = scoredPRs.length;
  const quickWins = scoredPRs.filter((p) => p.isQuickWin).length;
  const stale60d = scoredPRs.filter(
    (p) => (Date.now() - new Date(p.pr.createdAt).getTime()) / 86400000 > 60
  ).length;
  const passing = scoredPRs.filter((p) => p.pr.ciStatus === 'passing').length;
  const failing = scoredPRs.filter((p) => p.pr.ciStatus === 'failing').length;
  const pending = totalPRs - passing - failing;

  const blocks: Block[] = [];

  blocks.push(h1(`Community PR Update — ${date}`));
  blocks.push(
    para(`${totalPRs} open PRs · ${quickWins} quick wins · ${stale60d} stale (>60d)`)
  );
  blocks.push(para(`CI: ${passing} passing · ${failing} failing · ${pending} pending`));
  blocks.push(div());

  // Sprint recommendation
  if (sprintPRs.length > 0) {
    blocks.push(h2(`🚀 Sprint Recommendation (${sprintPRs.length} picks)`));
    for (const pr of sprintPRs) {
      const loc = pr.pr.additions + pr.pr.deletions;
      const size = loc < 50 ? 'S' : loc < 300 ? 'M' : loc < 1000 ? 'L' : 'XL';
      const ci = pr.pr.ciStatus === 'passing' ? '✅' : pr.pr.ciStatus === 'failing' ? '❌' : '⏳';
      const tags: string[] = [];
      if (pr.priority === 'urgent') tags.push('🔴 urgent');
      else if (pr.priority === 'high') tags.push('🟠 high');
      if (pr.isQuickWin) tags.push('⚡ quick win');
      const linearUrl = linearUrls.get(pr.pr.number);
      const suffix = ` ${pr.pr.title.slice(0, 80)} · ${pr.area} · ${size} · ${ci}${tags.length ? ' · ' + tags.join(' · ') : ''}`;
      const spans: RichText[] = [
        t(`#${pr.pr.number}`, `https://github.com/strapi/strapi/pull/${pr.pr.number}`),
        t(suffix),
      ];
      if (linearUrl) {
        const id = linearUrl.split('/').pop() ?? 'ticket';
        spans.push(t(' · '), t(id, linearUrl));
      }
      blocks.push(li(...spans));
    }
    blocks.push(div());
  }

  // Summary
  blocks.push(h2('📊 Summary'));
  blocks.push(li(t(`${totalPRs} open community PRs tracked`)));
  if (categories.newSinceLastUpdate.length > 0)
    blocks.push(li(t(`${categories.newSinceLastUpdate.length} new since last update`)));
  if (categories.merged.length > 0) blocks.push(li(t(`${categories.merged.length} merged`)));
  if (categories.pickedUp.length > 0)
    blocks.push(li(t(`${categories.pickedUp.length} picked up by CMS`)));
  if (categories.closed.length > 0)
    blocks.push(li(t(`${categories.closed.length} closed (not merged)`)));
  if (categories.stale.length > 0)
    blocks.push(li(t(`${categories.stale.length} stale (>14 days in Todo)`)));
  blocks.push(div());

  // New since last update
  if (categories.newSinceLastUpdate.length > 0) {
    blocks.push(h2('🆕 New Since Last Update'));
    for (const pr of categories.newSinceLastUpdate) {
      const loc = pr.pr.additions + pr.pr.deletions;
      const size = loc < 50 ? 'S' : loc < 300 ? 'M' : loc < 1000 ? 'L' : 'XL';
      const ci = pr.pr.ciStatus === 'passing' ? '✅' : pr.pr.ciStatus === 'failing' ? '❌' : '⏳';
      blocks.push(
        li(
          t(`#${pr.pr.number}`, `https://github.com/strapi/strapi/pull/${pr.pr.number}`),
          t(
            ` ${pr.pr.title.slice(0, 80)} · @${pr.pr.author} · ${pr.area} · ${size} · ${ci} · v:${pr.value.total}`
          )
        )
      );
    }
    blocks.push(div());
  }

  // Picked up by CMS
  if (categories.pickedUp.length > 0) {
    blocks.push(h2('↗️ Picked Up by CMS'));
    for (const p of categories.pickedUp) {
      blocks.push(
        li(
          t(`#${p.prNumber}`, `https://github.com/strapi/strapi/pull/${p.prNumber}`),
          t(` ${p.title.slice(0, 80)} · ${p.identifier} · ${p.status}`)
        )
      );
    }
    blocks.push(div());
  }

  // Merged
  if (categories.merged.length > 0) {
    blocks.push(h2('✅ Merged'));
    for (const p of categories.merged) {
      blocks.push(
        li(
          t(`#${p.prNumber}`, `https://github.com/strapi/strapi/pull/${p.prNumber}`),
          t(` ${p.title.slice(0, 80)} (${p.identifier})`)
        )
      );
    }
    blocks.push(div());
  }

  // In progress
  if (categories.inProgress.length > 0) {
    blocks.push(h2('🔄 In Progress (CPR)'));
    for (const p of categories.inProgress) {
      blocks.push(
        li(
          t(`#${p.prNumber}`, `https://github.com/strapi/strapi/pull/${p.prNumber}`),
          t(` ${p.title.slice(0, 80)} · ${p.identifier} · ${p.status}`)
        )
      );
    }
    blocks.push(div());
  }

  // Stale
  if (categories.stale.length > 0) {
    blocks.push(h2('🕰️ Stale (>14 days in Todo)'));
    for (const p of categories.stale) {
      blocks.push(
        li(
          t(`#${p.prNumber}`, `https://github.com/strapi/strapi/pull/${p.prNumber}`),
          t(` ${p.title.slice(0, 80)} · ${p.identifier} · ${p.ageDays}d`)
        )
      );
    }
    blocks.push(div());
  }

  // All open PRs by priority
  blocks.push(h2('📋 All Open PRs'));
  const tiers: Array<[string, string]> = [
    ['urgent', '🔴 URGENT'],
    ['high', '🟠 HIGH'],
    ['normal', '🔵 NORMAL'],
    ['low', '⚪ LOW'],
  ];
  for (const [tier, label] of tiers) {
    const prs = scoredPRs
      .filter((p) => p.priority === tier)
      .sort((a, b) => b.value.total - a.value.total);
    blocks.push(h3(`${label} (${prs.length})`));
    if (prs.length === 0) {
      blocks.push(para('None'));
      continue;
    }
    for (const pr of prs) {
      const loc = pr.pr.additions + pr.pr.deletions;
      const size = loc < 50 ? 'S' : loc < 300 ? 'M' : loc < 1000 ? 'L' : 'XL';
      const ci = pr.pr.ciStatus === 'passing' ? '✅' : pr.pr.ciStatus === 'failing' ? '❌' : '⏳';
      const qw = pr.isQuickWin ? ' ⚡' : '';
      blocks.push(
        li(
          t(`#${pr.pr.number}`, `https://github.com/strapi/strapi/pull/${pr.pr.number}`),
          t(
            ` ${pr.pr.title.slice(0, 80)} · ${pr.area} · ${size} · ${ci}${qw} · v:${pr.value.total}`
          )
        )
      );
    }
  }

  return blocks;
}

// --- Notion API client ---

async function notionFetch(
  path: string,
  method: string,
  body?: unknown
): Promise<{ id: string; url: string }> {
  const res = await fetch(`${NOTION_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${NOTION_API_KEY}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Notion API ${res.status}: ${text}`);
  }

  return res.json() as Promise<{ id: string; url: string }>;
}

async function appendBlocks(pageId: string, blocks: Block[]): Promise<void> {
  for (let i = 0; i < blocks.length; i += 100) {
    await notionFetch(`/blocks/${pageId}/children`, 'PATCH', {
      children: blocks.slice(i, i + 100),
    });
  }
}

export async function postToNotion(title: string, blocks: Block[]): Promise<string | undefined> {
  if (!NOTION_API_KEY || !NOTION_DATABASE_ID) return undefined;

  const page = await notionFetch('/pages', 'POST', {
    parent: { database_id: NOTION_DATABASE_ID },
    properties: {
      Name: { title: [{ type: 'text', text: { content: title } }] },
    },
    children: blocks.slice(0, 100),
  });

  if (blocks.length > 100) {
    await appendBlocks(page.id, blocks.slice(100));
  }

  return page.url;
}
