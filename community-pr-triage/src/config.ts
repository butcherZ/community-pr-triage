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

export const LINEAR_TRIAGE_LABELS = {
  priority: {
    urgent: '97df26d2-ff52-4316-8f5b-1e3cfdda5953',
    high: 'a912f8bf-60bc-4f07-9cef-4cf46e50e45b',
    normal: 'ca37c53e-5bef-4ce9-9c44-ffc92ecc27ad',
    low: '183c4f99-bcc9-4ca1-86fd-9c30d1938da6',
  },
  complexity: {
    low: '97a5f309-56f9-43e2-b167-c89eb90bf1ec',
    medium: '6b790ca7-536d-4b88-8987-4b46ef8322c6',
    high: 'f96080ae-4e07-40cb-b647-c9b55f7c0b7e',
    very_high: 'b9938950-ff7e-4480-b169-3f6cc2e5d082',
  },
  quickWin: '24eb891f-061f-4d38-8f13-6a9e89f5a983',
  ci: {
    passing: 'a9f94fde-ac2d-4e67-8a57-2271ae9172cb',
    failing: '077d0c67-6ce2-4ab0-802b-f9ded8009373',
    pending: 'a3ace5ee-7ffd-498c-bc79-0cd2660c9cd1',
  },
} as const;
