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
