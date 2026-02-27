import { describe, it, expect } from 'vitest';
import { matchPRNumber, mapPriorityToLinear, mapLabelsToLinear, buildLabelIds, buildDescription } from '../syncer.js';
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

describe('buildLabelIds', () => {
  it('includes PR type, priority, complexity, CI, and quick win labels', () => {
    const ids = buildLabelIds({
      pr: {
        number: 123, title: 'test', author: 'contributor', body: '',
        labels: ['pr: fix'], additions: 10, deletions: 5, changedFiles: 1,
        createdAt: '2026-01-01T00:00:00Z', state: 'open', isDraft: false,
        mergedAt: null, closedAt: null, ciStatus: 'passing',
      },
      linkedIssues: [],
      value: { base: 30, severity: 0, status: 0, engagement: 0, urgency: 1.0, total: 30 },
      complexity: 'low', priority: 'urgent', area: 'admin', areaTier: 'medium',
      prType: 'fix', isQuickWin: true,
    } as ScoredPR);
    // PR type: Bug
    expect(ids).toContain('a850ce54-33cd-4917-a06a-4d2df6dafab2');
    // Priority: Urgent
    expect(ids).toContain('97df26d2-ff52-4316-8f5b-1e3cfdda5953');
    // Complexity: Low
    expect(ids).toContain('97a5f309-56f9-43e2-b167-c89eb90bf1ec');
    // CI: Passing
    expect(ids).toContain('a9f94fde-ac2d-4e67-8a57-2271ae9172cb');
    // Quick Win
    expect(ids).toContain('24eb891f-061f-4d38-8f13-6a9e89f5a983');
    expect(ids).toHaveLength(5);
  });

  it('omits quick win label when not a quick win', () => {
    const ids = buildLabelIds({
      pr: {
        number: 456, title: 'test', author: 'user', body: '',
        labels: ['pr: enhancement'], additions: 500, deletions: 100, changedFiles: 15,
        createdAt: '2026-01-01T00:00:00Z', state: 'open', isDraft: false,
        mergedAt: null, closedAt: null, ciStatus: 'failing',
      },
      linkedIssues: [],
      value: { base: 20, severity: 0, status: 0, engagement: 0, urgency: 1.0, total: 20 },
      complexity: 'high', priority: 'low', area: 'admin', areaTier: 'medium',
      prType: 'enhancement', isQuickWin: false,
    } as ScoredPR);
    // Should NOT contain quick win
    expect(ids).not.toContain('24eb891f-061f-4d38-8f13-6a9e89f5a983');
    expect(ids).toHaveLength(4);
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
