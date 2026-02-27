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
