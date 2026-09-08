import {
  OUTREACH_DRAFT_MODES,
  OUTREACH_JOB_TYPES,
  OUTREACH_PARTICIPANT_ACTIVITY_WINDOW_DAYS,
  OUTREACH_PARTICIPANT_DRAFT_MAX_WORD_CHANGES,
  OUTREACH_SETUP_MAX_ACCOUNTS,
  OUTREACH_SETUP_MAX_COMMUNITIES,
  OUTREACH_SETUP_MAX_EXAMPLE_MESSAGES,
  OUTREACH_SETUP_MAX_KEYWORDS,
  OUTREACH_SETUP_MAX_SOURCE_AGE_DAYS
} from "./frameworkContract.generated.js";
import type { ParticipantDraftAlias, ParticipantDraftMode } from "./participantDrafts.js";

export type OutreachJobType = (typeof OUTREACH_JOB_TYPES)[number];

export interface RedditOutreachAccountInput {
  id: string;
  username: string;
  enabled?: boolean;
}

export interface RedditOutreachAccount {
  id: string;
  username: string;
  enabled: boolean;
}

export interface RedditLeadStandardsInput {
  targetAudience: string;
  communities: string[];
  keywords: string[];
  maxSourceAgeDays?: number;
  excludedUsernames?: string[];
}

export interface RedditLeadStandards {
  targetAudience: string;
  communities: string[];
  keywords: string[];
  maxSourceAgeDays: number;
  excludedUsernames: string[];
  requireDirectMessageAccess: true;
  requireExactSourceEvidence: true;
}

export interface OutreachExampleMessageInput {
  id: string;
  name: string;
  message: string;
}

export type OutreachExampleMessage = OutreachExampleMessageInput;

export interface RedditDraftingPreferencesInput {
  mode: ParticipantDraftMode;
  exampleMessages: OutreachExampleMessageInput[];
  maxWordChanges?: number;
}

export interface RedditDraftingPreferences {
  mode: ParticipantDraftMode;
  exampleMessages: OutreachExampleMessage[];
  maxWordChanges: number | null;
}

export interface RedditOutreachSetupInput {
  jobType: OutreachJobType;
  accounts: RedditOutreachAccountInput[];
  leadStandards: RedditLeadStandardsInput;
  drafting: RedditDraftingPreferencesInput;
}

export type RedditOutreachNextAction =
  | "collect_candidate_evidence"
  | "build_review_only_drafts"
  | "queue_human_approved_messages";

export interface RedditOutreachJobPlan {
  type: OutreachJobType;
  accountIds: string[];
  nextAction: RedditOutreachNextAction;
  humanApprovalRequiredBeforeDelivery: true;
}

export interface RedditOutreachSetup {
  schemaVersion: "ii-outreach.reddit-setup.v1";
  jobType: OutreachJobType;
  accounts: RedditOutreachAccount[];
  leadStandards: RedditLeadStandards;
  drafting: RedditDraftingPreferences;
  job: RedditOutreachJobPlan;
}

export function createRedditOutreachSetup(value: unknown): RedditOutreachSetup {
  const input = exactRecord(
    value,
    "Reddit outreach setup",
    ["jobType", "accounts", "leadStandards", "drafting"]
  );
  const jobType = oneOf(input.jobType, OUTREACH_JOB_TYPES, "jobType");
  const accounts = validateAccounts(input.accounts);
  const leadStandards = validateLeadStandards(input.leadStandards);
  const drafting = validateDraftingPreferences(input.drafting);
  const configuration = { jobType, accounts, leadStandards, drafting };
  return {
    schemaVersion: "ii-outreach.reddit-setup.v1",
    ...configuration,
    job: planRedditOutreachJob(configuration)
  };
}

export function planRedditOutreachJob(
  setup: Pick<RedditOutreachSetup, "jobType" | "accounts">
): RedditOutreachJobPlan {
  const jobType = oneOf(setup.jobType, OUTREACH_JOB_TYPES, "jobType");
  const accountIds = validateAccounts(setup.accounts)
    .filter((account) => account.enabled)
    .map((account) => account.id);
  if (accountIds.length === 0) {
    throw new Error("a Reddit outreach job requires at least one enabled account");
  }
  const nextActions: Record<OutreachJobType, RedditOutreachNextAction> = {
    find_leads: "collect_candidate_evidence",
    draft_messages: "build_review_only_drafts",
    send_messages: "queue_human_approved_messages"
  };
  return {
    type: jobType,
    accountIds,
    nextAction: nextActions[jobType],
    humanApprovalRequiredBeforeDelivery: true
  };
}

export function participantDraftAliasesFromSetup(
  setup: Pick<RedditOutreachSetup, "drafting">
): ParticipantDraftAlias[] {
  return setup.drafting.exampleMessages.map((example) => ({
    messageId: example.id,
    alias: example.name,
    message: example.message
  }));
}

function validateAccounts(value: unknown): RedditOutreachAccount[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > OUTREACH_SETUP_MAX_ACCOUNTS) {
    throw new Error(`accounts must contain one to ${OUTREACH_SETUP_MAX_ACCOUNTS} Reddit accounts`);
  }
  const accounts = value.map((raw, index) => {
    const account = exactRecord(raw, `accounts[${index}]`, ["id", "username", "enabled"]);
    return {
      id: requiredText(account.id, `accounts[${index}].id`, 180),
      username: redditUsername(account.username, `accounts[${index}].username`),
      enabled: account.enabled === undefined ? true : requiredBoolean(account.enabled, `accounts[${index}].enabled`)
    };
  });
  unique(accounts.map((account) => account.id), "account ids");
  unique(accounts.map((account) => account.username.toLowerCase()), "Reddit usernames");
  return accounts;
}

function validateLeadStandards(value: unknown): RedditLeadStandards {
  const standards = exactRecord(value, "leadStandards", [
    "targetAudience",
    "communities",
    "keywords",
    "maxSourceAgeDays",
    "excludedUsernames"
  ]);
  const communities = textList(
    standards.communities,
    "leadStandards.communities",
    1,
    OUTREACH_SETUP_MAX_COMMUNITIES,
    100
  ).map((community) => community.replace(/^r\//iu, ""));
  const keywords = textList(
    standards.keywords,
    "leadStandards.keywords",
    1,
    OUTREACH_SETUP_MAX_KEYWORDS,
    300
  );
  const excludedUsernames = textList(
    standards.excludedUsernames ?? [],
    "leadStandards.excludedUsernames",
    0,
    500,
    32
  ).map((username) => redditUsername(username, "leadStandards.excludedUsernames"));
  const maxSourceAgeDays = standards.maxSourceAgeDays === undefined
    ? OUTREACH_PARTICIPANT_ACTIVITY_WINDOW_DAYS
    : boundedInteger(
      standards.maxSourceAgeDays,
      "leadStandards.maxSourceAgeDays",
      1,
      OUTREACH_SETUP_MAX_SOURCE_AGE_DAYS
    );
  unique(communities.map((community) => community.toLowerCase()), "lead communities");
  unique(keywords.map((keyword) => keyword.toLowerCase()), "lead keywords");
  unique(excludedUsernames.map((username) => username.toLowerCase()), "excluded Reddit usernames");
  return {
    targetAudience: requiredText(standards.targetAudience, "leadStandards.targetAudience", 1000),
    communities,
    keywords,
    maxSourceAgeDays,
    excludedUsernames,
    requireDirectMessageAccess: true,
    requireExactSourceEvidence: true
  };
}

function validateDraftingPreferences(value: unknown): RedditDraftingPreferences {
  const drafting = exactRecord(value, "drafting", ["mode", "exampleMessages", "maxWordChanges"]);
  const mode = oneOf(drafting.mode, OUTREACH_DRAFT_MODES, "drafting.mode");
  if (
    !Array.isArray(drafting.exampleMessages) ||
    drafting.exampleMessages.length < 1 ||
    drafting.exampleMessages.length > OUTREACH_SETUP_MAX_EXAMPLE_MESSAGES
  ) {
    throw new Error(
      `drafting.exampleMessages must contain one to ${OUTREACH_SETUP_MAX_EXAMPLE_MESSAGES} messages`
    );
  }
  const exampleMessages = drafting.exampleMessages.map((raw, index) => {
    const example = exactRecord(raw, `drafting.exampleMessages[${index}]`, ["id", "name", "message"]);
    return {
      id: requiredText(example.id, `drafting.exampleMessages[${index}].id`, 180),
      name: requiredText(example.name, `drafting.exampleMessages[${index}].name`, 160),
      message: requiredText(example.message, `drafting.exampleMessages[${index}].message`, 4000)
    };
  });
  unique(exampleMessages.map((example) => example.id), "example message ids");
  return {
    mode,
    exampleMessages,
    maxWordChanges: validateMaxWordChanges(mode, drafting.maxWordChanges)
  };
}

function validateMaxWordChanges(mode: ParticipantDraftMode, value: unknown): number | null {
  if (mode === "exact") {
    if (value !== undefined && value !== 0) {
      throw new Error("drafting.maxWordChanges must be 0 in exact mode");
    }
    return 0;
  }
  if (mode === "new") {
    if (value !== undefined) {
      throw new Error("drafting.maxWordChanges is not used in new mode");
    }
    return null;
  }
  return value === undefined
    ? OUTREACH_PARTICIPANT_DRAFT_MAX_WORD_CHANGES
    : boundedInteger(
      value,
      "drafting.maxWordChanges",
      1,
      OUTREACH_PARTICIPANT_DRAFT_MAX_WORD_CHANGES
    );
}

function exactRecord(value: unknown, name: string, allowedKeys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  const result = value as Record<string, unknown>;
  const unexpected = Object.keys(result).filter((key) => !allowedKeys.includes(key));
  if (unexpected.length > 0) {
    throw new Error(`${name} contains unsupported fields: ${unexpected.join(", ")}`);
  }
  return result;
}

function oneOf<const Values extends readonly string[]>(
  value: unknown,
  values: Values,
  name: string
): Values[number] {
  if (typeof value !== "string" || !(values as readonly string[]).includes(value)) {
    throw new Error(`${name} must be one of: ${values.join(", ")}`);
  }
  return value as Values[number];
}

function textList(
  value: unknown,
  name: string,
  minItems: number,
  maxItems: number,
  maxLength: number
): string[] {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) {
    throw new Error(`${name} must contain ${minItems} to ${maxItems} values`);
  }
  return value.map((item) => requiredText(item, name, maxLength));
}

function requiredText(value: unknown, name: string, maxLength: number): string {
  if (typeof value !== "string" || value.trim().length < 1 || value.trim().length > maxLength) {
    throw new Error(`${name} must be non-empty and at most ${maxLength} characters`);
  }
  return value.trim();
}

function redditUsername(value: unknown, name: string): string {
  const username = requiredText(value, name, 34).replace(/^u\//iu, "");
  if (!/^[A-Za-z0-9_-]{3,20}$/u.test(username)) {
    throw new Error(`${name} must be a valid Reddit username`);
  }
  return username;
}

function requiredBoolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${name} must be a boolean`);
  return value;
}

function boundedInteger(value: unknown, name: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return value as number;
}

function unique(values: string[], name: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${name} must be unique`);
}
