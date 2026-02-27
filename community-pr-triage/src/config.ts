export const REPO = 'strapi/strapi';

export const STRAPI_ORG = 'strapi';

export const BOT_PATTERNS = ['[bot]', 'app/dependabot', 'renovate'];

export const AREA_TIERS: Record<string, string[]> = {
  critical: ['database', 'strapi'],
  high: ['content-manager', 'upload', 'users-permissions'],
  medium: ['admin', 'content-type-builder', 'i18n'],
  low: ['documentation', 'graphql', 'typescript', 'dependencies'],
};

export const LINEAR_TEAM_ID = 'a545ae90-ba50-4427-83e6-c0ce7dde9528';

export const LINEAR_STATUSES = {
  triage: 'cf0651ff-654a-464e-893b-bb18af7053e5',
  done: 'c82d01d6-921f-4774-8031-584b1be9fc63',
  canceled: '79faca9e-011b-422a-b8cc-d41dcab6f8cd',
} as const;

export const LINEAR_LABELS: Record<string, string> = {
  'pr: fix': 'a850ce54-33cd-4917-a06a-4d2df6dafab2',
  'pr: feature': '5e7646f1-4f73-4d37-9b2b-3ededc0c2475',
  'pr: enhancement': '54d83c27-3456-4fb9-98e2-15fab6c0eb3d',
  'pr: chore': 'f0230cb8-d531-4a6c-9836-c4278741fb38',
  'pr: doc': '6711572b-0ab3-4a0d-9338-eac4479d8191',
};
