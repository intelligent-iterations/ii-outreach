import {
  OUTREACH_PARTICIPANT_RESPONSE_DEFAULT_BATCH_SIZE,
  OUTREACH_PARTICIPANT_RESPONSE_MAX_BATCH_SIZE,
  OUTREACH_PARTICIPANT_RESPONSE_MAX_PER_CHECK,
  OUTREACH_PARTICIPANT_RESPONSE_MAX_STORED,
  OUTREACH_PARTICIPANT_RESPONSE_READBACK,
  OUTREACH_PARTICIPANT_RESPONSE_TARGET_LIMIT
} from "./frameworkContract.generated.js";

export const PARTICIPANT_RESPONSE_TARGET_LIMIT =
  OUTREACH_PARTICIPANT_RESPONSE_TARGET_LIMIT;
export const PARTICIPANT_RESPONSE_DEFAULT_BATCH_SIZE =
  OUTREACH_PARTICIPANT_RESPONSE_DEFAULT_BATCH_SIZE;
export const PARTICIPANT_RESPONSE_MAX_BATCH_SIZE =
  OUTREACH_PARTICIPANT_RESPONSE_MAX_BATCH_SIZE;
export const PARTICIPANT_RESPONSE_MAX_PER_CHECK =
  OUTREACH_PARTICIPANT_RESPONSE_MAX_PER_CHECK;
export const PARTICIPANT_RESPONSE_MAX_STORED =
  OUTREACH_PARTICIPANT_RESPONSE_MAX_STORED;
export const PARTICIPANT_RESPONSE_READBACK = OUTREACH_PARTICIPANT_RESPONSE_READBACK;

export interface ParticipantResponseTarget {
  messageId: string;
  accountId: string;
  redditUsername: string;
  outboundMessage: string;
  conversationUrl: string;
  sentAt: string;
  knownResponseIds: string[];
}

export interface ParticipantResponseReadback {
  response_id?: unknown;
  text?: unknown;
  received_at?: unknown;
  observed_at?: unknown;
  verified_via?: unknown;
}

export interface ParticipantConversationReadback {
  sender_account?: unknown;
  checked_at?: unknown;
  conversation_url?: unknown;
  source_conversation_url?: unknown;
  verified_via?: unknown;
  responses?: unknown;
}

export interface ParticipantResponseCheckEvent {
  accountId: string;
  checkedAt: string;
  conversationUrl: string;
  sourceConversationUrl?: string;
  verifiedVia: string;
  responses: Array<{
    responseId: string;
    text: string;
    receivedAt?: unknown;
    observedAt: string;
    verifiedVia: string;
  }>;
}

export interface ParticipantOutboundMessageStats {
  confirmedSentCount: number;
  reconciliationTargetCount: number;
  timeZone: string;
  firstSentAt?: string;
  lastSentAt?: string;
  byDay: Array<{ date: string; count: number }>;
}

export interface ParticipantStoredResponseCounts {
  responseCount: number;
  newResponseCount: number;
  respondedConversationCount: 0 | 1;
}

export function normalizeParticipantResponseTargets(value: unknown): ParticipantResponseTarget[] {
  if (!Array.isArray(value) || value.length > PARTICIPANT_RESPONSE_TARGET_LIMIT) {
    throw new Error("The host returned an invalid participant response target list.");
  }
  return value.map((raw) => {
    const target = objectValue(raw);
    return {
      messageId: requiredText(target.messageId, "messageId"),
      accountId: requiredText(target.accountId, "accountId"),
      redditUsername: requiredText(target.redditUsername, "redditUsername"),
      outboundMessage: requiredText(target.outboundMessage, "outboundMessage"),
      conversationUrl: requiredText(target.conversationUrl, "conversationUrl"),
      sentAt: requiredText(target.sentAt, "sentAt"),
      knownResponseIds: Array.isArray(target.knownResponseIds)
        ? target.knownResponseIds.map((item) => requiredText(item, "knownResponseId"))
        : []
    };
  });
}

export function participantResponseBatchSize(value: unknown): number {
  if (value === undefined || value === null || value === "") {
    return PARTICIPANT_RESPONSE_DEFAULT_BATCH_SIZE;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > PARTICIPANT_RESPONSE_MAX_BATCH_SIZE) {
    throw new Error(
      `Reddit response batch size must be between 1 and ${PARTICIPANT_RESPONSE_MAX_BATCH_SIZE}.`
    );
  }
  return parsed;
}

export function participantResponseTargetBatches(
  targets: ParticipantResponseTarget[],
  requestedSize: unknown
): ParticipantResponseTarget[][] {
  const size = participantResponseBatchSize(requestedSize);
  const result: ParticipantResponseTarget[][] = [];
  for (let index = 0; index < targets.length; index += size) {
    result.push(targets.slice(index, index + size));
  }
  return result;
}

export function partitionParticipantResponseTargets(
  targets: ParticipantResponseTarget[],
  isExactConversationUrl: (value: string) => boolean
): { exact: ParticipantResponseTarget[]; legacy: ParticipantResponseTarget[] } {
  const exact: ParticipantResponseTarget[] = [];
  const legacy: ParticipantResponseTarget[] = [];
  for (const target of targets) {
    try {
      (isExactConversationUrl(target.conversationUrl) ? exact : legacy).push(target);
    } catch {
      legacy.push(target);
    }
  }
  return { exact, legacy };
}

export function participantResponseCheckEvent(
  raw: ParticipantConversationReadback,
  requestedAccountId: unknown = raw?.sender_account
): ParticipantResponseCheckEvent {
  const responses = Array.isArray(raw?.responses) ? raw.responses : [];
  if (responses.length > PARTICIPANT_RESPONSE_MAX_PER_CHECK) {
    throw new Error(
      `A participant response check may report no more than ${PARTICIPANT_RESPONSE_MAX_PER_CHECK} messages.`
    );
  }
  const sourceConversationUrl = optionalText(raw?.source_conversation_url);
  return {
    accountId: requiredText(requestedAccountId, "accountId"),
    checkedAt: requiredText(raw?.checked_at, "checked_at"),
    conversationUrl: requiredText(raw?.conversation_url, "conversation_url"),
    ...(sourceConversationUrl ? { sourceConversationUrl } : {}),
    verifiedVia: requiredText(raw?.verified_via, "verified_via"),
    responses: responses.map((item) => {
      const response = objectValue(item);
      return {
        responseId: requiredText(response.response_id, "response_id"),
        text: requiredText(response.text, "response text"),
        ...(response.received_at ? { receivedAt: response.received_at } : {}),
        observedAt: requiredText(response.observed_at, "observed_at"),
        verifiedVia: requiredText(response.verified_via, "response verified_via")
      };
    })
  };
}

export function participantOutboundMessageStats(
  targets: ParticipantResponseTarget[],
  options: {
    timeZone?: string;
    isExactConversationUrl: (value: string) => boolean;
  }
): ParticipantOutboundMessageStats {
  const { exact, legacy } = partitionParticipantResponseTargets(
    targets,
    options.isExactConversationUrl
  );
  const timeZone = validTimeZone(options.timeZone || "America/Toronto");
  const sent = exact
    .map((target) => validDate(target.sentAt, "sentAt"))
    .sort((left, right) => left.getTime() - right.getTime());
  const counts = new Map<string, number>();
  for (const date of sent) {
    const day = localDateKey(date, timeZone);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return {
    confirmedSentCount: sent.length,
    reconciliationTargetCount: legacy.length,
    timeZone,
    firstSentAt: sent[0]?.toISOString(),
    lastSentAt: sent.at(-1)?.toISOString(),
    byDay: [...counts.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, count]) => ({ date, count }))
  };
}

export function participantStoredResponseCounts(value: unknown): ParticipantStoredResponseCounts {
  const result = objectValue(value);
  const message = objectValue(result.message);
  if (!Array.isArray(message.responses) || message.responses.length > PARTICIPANT_RESPONSE_MAX_STORED) {
    throw new Error("The host returned an invalid participant response-check result.");
  }
  const newResponseCount = Number(result.newResponseCount ?? 0);
  if (!Number.isInteger(newResponseCount) || newResponseCount < 0) {
    throw new Error("The host returned an invalid participant response-check result.");
  }
  return {
    responseCount: message.responses.length,
    newResponseCount,
    respondedConversationCount: message.responses.length > 0 ? 1 : 0
  };
}

function objectValue(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function optionalText(value: unknown): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
}

function requiredText(value: unknown, name: string): string {
  const text = optionalText(value);
  if (!text) throw new Error(`${name} is required`);
  return text;
}

function validDate(value: unknown, name: string): Date {
  const date = new Date(requiredText(value, name));
  if (Number.isNaN(date.getTime())) throw new Error(`${name} must be a valid date`);
  return date;
}

function validTimeZone(value: string): string {
  const timeZone = value.trim();
  try {
    new Intl.DateTimeFormat("en", { timeZone });
  } catch {
    throw new Error(`Invalid OUTREACH_TIMEZONE: ${timeZone}`);
  }
  return timeZone;
}

function localDateKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}
