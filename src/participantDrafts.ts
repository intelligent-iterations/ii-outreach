import {
  readOutreachPromptTemplate,
  renderOutreachPromptTemplate
} from "./promptTemplate.js";
import {
  OUTREACH_PARTICIPANT_DRAFT_ALIAS_LIMIT,
  OUTREACH_PARTICIPANT_DRAFT_MAX_CANDIDATES,
  OUTREACH_PARTICIPANT_DRAFT_MAX_COMMUNITY_WORDS,
  OUTREACH_PARTICIPANT_DRAFT_MAX_RANKED_ALIASES,
  OUTREACH_PARTICIPANT_DRAFT_MAX_WORD_CHANGES
} from "./frameworkContract.generated.js";

export const PARTICIPANT_DRAFT_ALIAS_LIMIT = OUTREACH_PARTICIPANT_DRAFT_ALIAS_LIMIT;
export const PARTICIPANT_DRAFT_MAX_WORD_CHANGES =
  OUTREACH_PARTICIPANT_DRAFT_MAX_WORD_CHANGES;
export const PARTICIPANT_DRAFT_MAX_RANKED_ALIASES =
  OUTREACH_PARTICIPANT_DRAFT_MAX_RANKED_ALIASES;
export const PARTICIPANT_DRAFT_MAX_CANDIDATES =
  OUTREACH_PARTICIPANT_DRAFT_MAX_CANDIDATES;
export const PARTICIPANT_DRAFT_MAX_COMMUNITY_WORDS =
  OUTREACH_PARTICIPANT_DRAFT_MAX_COMMUNITY_WORDS;

export type ParticipantIntentMode = "high_intent" | "community_assumed_intent";
export type ParticipantDraftMode = "exact" | "adapt" | "new";
export type ParticipantDraftEditOperation = "insert" | "replace" | "delete";

export interface ParticipantDraftCampaign {
  productName: string;
  productUrl: string;
  productSummary: string;
  targetAudience: string;
  cta: string;
  valuePropositions: string[];
  competitors: string[];
  queries: string[];
  participantCommunities: string[];
}

export interface ParticipantDraftCandidate {
  leadId: string;
  redditUsername: string;
  sourceUrl: string;
  sourceText: string;
  sourceKind: string;
  subreddit: string;
  qualificationNotes: string;
  qualificationBasis: string;
  intentMode: ParticipantIntentMode;
}

export interface ParticipantDraftAlias {
  messageId: string;
  alias: string;
  message: string;
  sentAt?: string;
}

export interface ParticipantDraftInput {
  campaign: ParticipantDraftCampaign;
  candidates: ParticipantDraftCandidate[];
  aliases: ParticipantDraftAlias[];
  draftMode?: ParticipantDraftMode;
  maxWordChanges: number;
}

export interface ParticipantDraftAgentCandidate {
  candidateRef: string;
  intentMode: ParticipantIntentMode;
  draftMode: ParticipantDraftMode;
  sourceText: string;
  subreddit: string;
}

export interface ParticipantDraftAgentAlias {
  aliasRef: string;
  alias: string;
  message: string;
}

export interface ParticipantDraftAgentCampaign {
  productName: string;
  productSummary: string;
  targetAudience: string;
}

export interface ParticipantDraftAgentInput {
  campaign: ParticipantDraftAgentCampaign;
  maxWordChanges: number;
  candidates: ParticipantDraftAgentCandidate[];
  aliases: ParticipantDraftAgentAlias[];
}

export interface ParticipantDraftEvidence {
  title: string;
  url: string;
}

export interface ParticipantMessageDraft {
  leadId: string;
  status: "draft";
  intentMode: ParticipantIntentMode;
  draftMode: ParticipantDraftMode;
  selectedMessageId: string;
  rankedMessageIds: string[];
  message: string;
  commentOpener: string;
  editCount: number | null;
  reason: string;
  researchEvidence: ParticipantDraftEvidence[];
}

export interface ParticipantDraftBatch {
  drafts: ParticipantMessageDraft[];
}

export function validateParticipantDraftInput(value: unknown): ParticipantDraftInput {
  const input = record(value, "participant draft input");
  if (
    !Array.isArray(input.candidates) ||
    input.candidates.length < 1 ||
    input.candidates.length > PARTICIPANT_DRAFT_MAX_CANDIDATES
  ) {
    throw new Error(
      `participant draft input must contain one to ${PARTICIPANT_DRAFT_MAX_CANDIDATES} candidates`
    );
  }
  if (
    !Array.isArray(input.aliases) ||
    input.aliases.length < 1 ||
    input.aliases.length > PARTICIPANT_DRAFT_ALIAS_LIMIT
  ) {
    throw new Error(
      `participant draft input must contain one to ${PARTICIPANT_DRAFT_ALIAS_LIMIT} example messages`
    );
  }
  const campaign = validateParticipantDraftCampaign(input.campaign);
  const draftMode = validateParticipantDraftMode(input.draftMode);
  const maxWordChanges = validateParticipantMaxWordChanges(draftMode, input.maxWordChanges);
  const candidates = input.candidates.map((raw) => {
    const candidate = record(raw, "participant draft candidate");
    const qualificationBasis = requiredText(
      candidate.qualificationBasis,
      "qualificationBasis",
      60
    );
    return {
      leadId: requiredText(candidate.leadId, "leadId", 180),
      redditUsername: requiredText(candidate.redditUsername, "redditUsername", 32),
      sourceUrl: httpUrl(candidate.sourceUrl, "sourceUrl"),
      sourceText: requiredText(candidate.sourceText, "sourceText", 5000).slice(0, 2400),
      sourceKind: requiredText(candidate.sourceKind, "sourceKind", 24),
      subreddit: requiredText(candidate.subreddit, "subreddit", 100),
      qualificationNotes: requiredText(candidate.qualificationNotes, "qualificationNotes", 1000),
      qualificationBasis,
      intentMode: participantIntentMode(qualificationBasis)
    };
  });
  const aliases = input.aliases.map((raw) => {
    const alias = record(raw, "participant draft alias");
    return {
      messageId: requiredText(alias.messageId, "messageId", 180),
      alias: requiredText(alias.alias, "alias", 160),
      message: requiredText(alias.message, "message", 4000),
      ...(typeof alias.sentAt === "string" && alias.sentAt.trim()
        ? { sentAt: alias.sentAt.trim() }
        : {})
    };
  });
  if (new Set(candidates.map((candidate) => candidate.leadId)).size !== candidates.length) {
    throw new Error("participant draft input contains duplicate candidate identifiers");
  }
  if (new Set(aliases.map((alias) => alias.messageId)).size !== aliases.length) {
    throw new Error("participant draft input contains duplicate saved-message identifiers");
  }
  return {
    campaign,
    candidates,
    aliases,
    ...(draftMode ? { draftMode } : {}),
    maxWordChanges
  };
}

export function participantDraftModeForCandidate(
  draftMode: ParticipantDraftMode | undefined,
  intentMode: ParticipantIntentMode
): ParticipantDraftMode {
  if (draftMode) return draftMode;
  return intentMode === "high_intent" ? "adapt" : "new";
}

export function participantIntentMode(qualificationBasis: string): ParticipantIntentMode {
  switch (qualificationBasis) {
    case "community_assumed_intent":
    case "whitelist_recent_activity":
      return "community_assumed_intent";
    case "explicit_intent_recent_activity":
    case "manifest_intent_recent_activity":
      return "high_intent";
    default:
      throw new Error(`unsupported participant qualification basis: ${qualificationBasis}`);
  }
}

export function participantDraftOutputSchema(candidateCount: number, aliasCount: number): object {
  validateCandidateCount(candidateCount);
  if (
    !Number.isSafeInteger(aliasCount) ||
    aliasCount < 1 ||
    aliasCount > PARTICIPANT_DRAFT_ALIAS_LIMIT
  ) {
    throw new Error(
      `participant draft alias count must be between one and ${PARTICIPANT_DRAFT_ALIAS_LIMIT}`
    );
  }
  const candidateRefs = Array.from({ length: candidateCount }, (_, index) =>
    participantDraftCandidateRef(index)
  );
  const aliasRefs = Array.from({ length: aliasCount }, (_, index) =>
    participantDraftAliasRef(index)
  );
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      drafts: {
        type: "array",
        minItems: candidateCount,
        maxItems: candidateCount,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            candidateRef: { type: "string", enum: candidateRefs },
            selectedAliasRef: { type: "string", enum: aliasRefs },
            rankedAliasRefs: {
              type: "array",
              minItems: 1,
              maxItems: PARTICIPANT_DRAFT_MAX_RANKED_ALIASES,
              items: { type: "string", enum: aliasRefs }
            },
            edits: {
              type: "array",
              maxItems: PARTICIPANT_DRAFT_MAX_WORD_CHANGES,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  operation: { type: "string", enum: ["insert", "replace", "delete"] },
                  index: { type: "integer", minimum: 0, maximum: 10000 },
                  value: { type: "string", maxLength: 160 }
                },
                required: ["operation", "index", "value"]
              }
            },
            tailoredMessage: { type: "string", maxLength: 1000 },
            reason: { type: "string", minLength: 1, maxLength: 300 }
          },
          required: [
            "candidateRef",
            "selectedAliasRef",
            "rankedAliasRefs",
            "edits",
            "tailoredMessage",
            "reason"
          ]
        }
      }
    },
    required: ["drafts"]
  };
}

export function participantDraftCandidateRef(index: number): string {
  if (!Number.isSafeInteger(index) || index < 0 || index >= PARTICIPANT_DRAFT_MAX_CANDIDATES) {
    throw new Error(
      `participant draft candidate index must be between zero and ${PARTICIPANT_DRAFT_MAX_CANDIDATES - 1}`
    );
  }
  return `candidate-${String(index + 1).padStart(3, "0")}`;
}

export function participantDraftAliasRef(index: number): string {
  if (!Number.isSafeInteger(index) || index < 0 || index >= PARTICIPANT_DRAFT_ALIAS_LIMIT) {
    throw new Error("participant draft alias index must be between zero and 99");
  }
  return `alias-${String(index + 1).padStart(3, "0")}`;
}

export function buildParticipantDraftAgentInput(input: ParticipantDraftInput): ParticipantDraftAgentInput {
  return {
    campaign: {
      productName: input.campaign.productName,
      productSummary: input.campaign.productSummary,
      targetAudience: input.campaign.targetAudience
    },
    maxWordChanges: input.maxWordChanges,
    candidates: input.candidates.map((candidate, index) => ({
      candidateRef: participantDraftCandidateRef(index),
      intentMode: candidate.intentMode,
      draftMode: participantDraftModeForCandidate(input.draftMode, candidate.intentMode),
      sourceText: candidate.sourceText,
      subreddit: candidate.subreddit
    })),
    aliases: input.aliases.map((alias, index) => ({
      aliasRef: participantDraftAliasRef(index),
      alias: alias.alias,
      message: alias.message
    }))
  };
}

function validateParticipantDraftMode(value: unknown): ParticipantDraftMode | undefined {
  if (value === undefined) return undefined;
  if (!(value === "exact" || value === "adapt" || value === "new")) {
    throw new Error("draftMode must be exact, adapt, or new");
  }
  return value;
}

function validateParticipantMaxWordChanges(
  mode: ParticipantDraftMode | undefined,
  value: unknown
): number {
  if (mode === "exact") {
    if (value !== undefined && value !== null && value !== 0) {
      throw new Error("maxWordChanges must be 0 in exact draft mode");
    }
    return 0;
  }
  if (mode === "new") {
    if (value !== undefined && value !== null) {
      throw new Error("maxWordChanges is not used in new draft mode");
    }
    return 0;
  }
  if (value === undefined) return PARTICIPANT_DRAFT_MAX_WORD_CHANGES;
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 1 ||
    (value as number) > PARTICIPANT_DRAFT_MAX_WORD_CHANGES
  ) {
    throw new Error(
      `maxWordChanges must be an integer from 1 to ${PARTICIPANT_DRAFT_MAX_WORD_CHANGES}`
    );
  }
  return value as number;
}

export function buildParticipantDraftPrompt(options: {
  inputPath: string;
  candidateCount: number;
  aliasCount: number;
}): string {
  validateCandidateCount(options.candidateCount);
  return renderOutreachPromptTemplate(
    readOutreachPromptTemplate("reddit-participant-message-alias-selection.md"),
    {
      INPUT_PATH_JSON: JSON.stringify(options.inputPath),
      CANDIDATE_COUNT: options.candidateCount,
      ALIAS_COUNT: options.aliasCount,
      MAX_WORD_CHANGES: PARTICIPANT_DRAFT_MAX_WORD_CHANGES,
      MAX_COMMUNITY_WORDS: PARTICIPANT_DRAFT_MAX_COMMUNITY_WORDS
    }
  );
}

export {
  materializeParticipantDraftBatch,
  participantDraftWordChanges
} from "./participantDraftMaterialization.js";

function validateParticipantDraftCampaign(value: unknown): ParticipantDraftCampaign {
  const campaign = record(value, "participant draft campaign");
  return {
    productName: requiredText(campaign.productName, "campaign.productName", 160),
    productUrl: httpUrl(campaign.productUrl, "campaign.productUrl"),
    productSummary: requiredText(campaign.productSummary, "campaign.productSummary", 4000),
    targetAudience: requiredText(campaign.targetAudience, "campaign.targetAudience", 1000),
    cta: optionalText(campaign.cta, "campaign.cta", 1000),
    valuePropositions: textList(campaign.valuePropositions, "campaign.valuePropositions", 30, 1000),
    competitors: textList(campaign.competitors, "campaign.competitors", 30, 300),
    queries: textList(campaign.queries, "campaign.queries", 50, 300),
    participantCommunities: textList(
      campaign.participantCommunities,
      "campaign.participantCommunities",
      100,
      64
    )
  };
}

function textList(
  value: unknown,
  name: string,
  maxItems: number,
  maxLength: number
): string[] {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new Error(`${name} must contain at most ${maxItems} values`);
  }
  return value.map((item) => requiredText(item, name, maxLength));
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, name: string, maxLength: number): string {
  if (typeof value !== "string" || value.trim().length < 1 || value.trim().length > maxLength) {
    throw new Error(`${name} must be non-empty and at most ${maxLength} characters`);
  }
  return value.trim();
}

function optionalText(value: unknown, name: string, maxLength: number): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string" || value.trim().length > maxLength) {
    throw new Error(`${name} must be a string with at most ${maxLength} characters`);
  }
  return value.trim();
}

function httpUrl(value: unknown, name: string): string {
  const raw = requiredText(value, name, 2048);
  const parsed = new URL(raw);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`${name} must use http or https`);
  }
  return parsed.toString();
}

function validateCandidateCount(candidateCount: number): void {
  if (
    !Number.isSafeInteger(candidateCount) ||
    candidateCount < 1 ||
    candidateCount > PARTICIPANT_DRAFT_MAX_CANDIDATES
  ) {
    throw new Error(
      `participant draft candidate count must be between one and ${PARTICIPANT_DRAFT_MAX_CANDIDATES}`
    );
  }
}
