import { createHash, randomInt } from "node:crypto";
import {
  OUTREACH_PARTICIPANT_DAILY_WINDOW_HOURS,
  OUTREACH_PARTICIPANT_DAILY_WINDOW_START_HOUR,
  OUTREACH_PARTICIPANT_MAX_SCHEDULE_DAYS,
  OUTREACH_PARTICIPANT_MAX_SPACING_MINUTES,
  OUTREACH_PARTICIPANT_MESSAGES_PER_ROLLING_HOUR,
  OUTREACH_PARTICIPANT_MIN_SPACING_MINUTES,
  OUTREACH_PARTICIPANT_SCHEDULE_POLICY_VERSION,
  OUTREACH_PARTICIPANT_TIME_ZONE
} from "./frameworkContract.generated.js";

export const PARTICIPANT_MESSAGES_PER_ROLLING_HOUR =
  OUTREACH_PARTICIPANT_MESSAGES_PER_ROLLING_HOUR;
export const PARTICIPANT_MIN_SPACING_MINUTES =
  OUTREACH_PARTICIPANT_MIN_SPACING_MINUTES;
export const PARTICIPANT_MAX_SPACING_MINUTES =
  OUTREACH_PARTICIPANT_MAX_SPACING_MINUTES;
export const PARTICIPANT_MAX_SCHEDULE_DAYS = OUTREACH_PARTICIPANT_MAX_SCHEDULE_DAYS;
export const PARTICIPANT_DAILY_WINDOW_TIME_ZONE = OUTREACH_PARTICIPANT_TIME_ZONE;
export const PARTICIPANT_DAILY_WINDOW_START_HOUR =
  OUTREACH_PARTICIPANT_DAILY_WINDOW_START_HOUR;
export const PARTICIPANT_DAILY_WINDOW_HOURS = OUTREACH_PARTICIPANT_DAILY_WINDOW_HOURS;
export const PARTICIPANT_SCHEDULE_POLICY_VERSION =
  OUTREACH_PARTICIPANT_SCHEDULE_POLICY_VERSION;

export type ParticipantMessageStatus =
  | "draft"
  | "queued_pending_sender"
  | "scheduled"
  | "dispatching"
  | "sent"
  | "failed"
  | "blocked"
  | "cancelled";

export interface ParticipantMessagingAccount {
  id: string;
  displayName?: string;
  healthy: boolean;
  enabled?: boolean;
}

export interface ParticipantQueuedMessage {
  id: string;
  workspaceId: string;
  campaignId: string;
  leadId: string;
  redditUsername: string;
  normalizedRedditUsername: string;
  message: string;
  accountId: string;
  requestedNotBefore: string;
  scheduledFor: string;
  spacingMinutes: number;
  status: ParticipantMessageStatus;
  senderEnabledAtQueueTime: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  approvedBy?: string;
  approvedAt?: string;
  approvalMessageSha256?: string;
  dispatchAttemptCount?: number;
  dispatchStartedAt?: string;
  lastErrorCode?: string;
  lastError?: string;
  deliveryUncertain?: boolean;
  sentAt?: string;
  conversationUrl?: string;
  verifiedVia?: "reddit_chat_message_readback";
}

export interface QueueParticipantMessageOptions {
  id: string;
  workspaceId: string;
  campaignId: string;
  leadId: string;
  redditUsername: string;
  message: string;
  requestedNotBefore?: Date | string;
  now?: Date | string;
  createdBy: string;
  accounts: ParticipantMessagingAccount[];
  existingMessages?: ParticipantQueuedMessage[];
  workspaceSuppressedUsernames?: Iterable<string>;
  senderEnabled?: boolean;
  approvedBy?: string;
  approvedAt?: Date | string;
  randomSpacingMinutes?: () => number;
}

export interface ParticipantMessageAllocation {
  accountId: string;
  scheduledFor: string;
  spacingMinutes: number;
}

export function queueParticipantMessage(options: QueueParticipantMessageOptions): ParticipantQueuedMessage {
  const now = validDate(options.now ?? new Date(), "now");
  const requested = validDate(options.requestedNotBefore ?? now, "requestedNotBefore");
  const notBefore = new Date(Math.max(now.getTime(), requested.getTime()));
  if (notBefore.getTime() > now.getTime() + PARTICIPANT_MAX_SCHEDULE_DAYS * 24 * 60 * 60 * 1000) {
    throw new Error(`participant messages cannot be scheduled more than ${PARTICIPANT_MAX_SCHEDULE_DAYS} days ahead`);
  }
  const username = requiredText(options.redditUsername, "redditUsername").replace(/^u\//i, "");
  const normalizedUsername = username.toLowerCase();
  const suppressed = new Set(
    [...(options.workspaceSuppressedUsernames ?? [])]
      .map((value) => value.trim().replace(/^u\//i, "").toLowerCase())
      .filter(Boolean)
  );
  if (suppressed.has(normalizedUsername)) {
    throw new Error(`reddit user ${username} is suppressed for this workspace`);
  }
  const duplicate = (options.existingMessages ?? []).find(
    (item) =>
      item.normalizedRedditUsername === normalizedUsername &&
      !["draft", "cancelled", "failed"].includes(item.status)
  );
  if (duplicate) {
    throw new Error(`reddit user ${username} already has an active or delivered workspace message`);
  }

  const allocation = allocateParticipantMessageSlot({
    accounts: options.accounts,
    existingMessages: options.existingMessages ?? [],
    notBefore,
    spacingMinutes: validateSpacing(
      options.randomSpacingMinutes?.() ??
        randomInt(PARTICIPANT_MIN_SPACING_MINUTES, PARTICIPANT_MAX_SPACING_MINUTES + 1)
    )
  });
  const timestamp = now.toISOString();
  const senderEnabled = options.senderEnabled === true;
  const message = validateMessage(options.message);
  const approval = senderEnabled
    ? participantApproval({ approvedBy: options.approvedBy, approvedAt: options.approvedAt, message, now })
    : {};
  return {
    id: requiredText(options.id, "id"),
    workspaceId: requiredText(options.workspaceId, "workspaceId"),
    campaignId: requiredText(options.campaignId, "campaignId"),
    leadId: requiredText(options.leadId, "leadId"),
    redditUsername: username,
    normalizedRedditUsername: normalizedUsername,
    message,
    accountId: allocation.accountId,
    requestedNotBefore: notBefore.toISOString(),
    scheduledFor: allocation.scheduledFor,
    spacingMinutes: allocation.spacingMinutes,
    status: senderEnabled ? "scheduled" : "queued_pending_sender",
    senderEnabledAtQueueTime: senderEnabled,
    createdBy: requiredText(options.createdBy, "createdBy"),
    createdAt: timestamp,
    updatedAt: timestamp,
    ...approval
  };
}

export function allocateParticipantMessageSlot(options: {
  accounts: ParticipantMessagingAccount[];
  existingMessages: ParticipantQueuedMessage[];
  notBefore: Date | string;
  spacingMinutes: number;
  excludeMessageId?: string;
}): ParticipantMessageAllocation {
  if (!Array.isArray(options.accounts) || options.accounts.length === 0 || options.accounts.length > 3) {
    throw new Error("participant messaging requires between one and three connected accounts");
  }
  const accountIds = new Set<string>();
  const accounts = options.accounts.filter((account) => {
    const id = requiredText(account.id, "account.id");
    if (accountIds.has(id)) {
      throw new Error(`duplicate participant messaging account: ${id}`);
    }
    accountIds.add(id);
    return account.healthy && account.enabled !== false;
  });
  if (accounts.length === 0) {
    throw new Error("participant messaging requires at least one healthy enabled account");
  }
  const notBefore = validDate(options.notBefore, "notBefore");
  const spacingMinutes = validateSpacing(options.spacingMinutes);
  const active = options.existingMessages.filter(
    (message) =>
      message.id !== options.excludeMessageId &&
      (["queued_pending_sender", "scheduled", "dispatching", "sent"].includes(message.status) ||
        (message.status === "blocked" && message.deliveryUncertain === true))
  );
  const candidates = accounts.map((account) => {
    const history = active.filter((message) => message.accountId === account.id);
    return {
      account,
      scheduledAt: earliestLegalTime(history, notBefore, spacingMinutes),
      recentCount: history.filter((message) => {
        const time = deliveryTime(message).getTime();
        return time >= notBefore.getTime() - 24 * 60 * 60 * 1000 && time <= notBefore.getTime();
      }).length
    };
  });
  candidates.sort(
    (left, right) =>
      left.scheduledAt.getTime() - right.scheduledAt.getTime() ||
      left.recentCount - right.recentCount ||
      left.account.id.localeCompare(right.account.id)
  );
  return {
    accountId: candidates[0].account.id,
    scheduledFor: candidates[0].scheduledAt.toISOString(),
    spacingMinutes
  };
}

export function activatePendingParticipantMessage(options: {
  message: ParticipantQueuedMessage;
  accounts: ParticipantMessagingAccount[];
  existingMessages: ParticipantQueuedMessage[];
  now?: Date | string;
  approvedBy: string;
  approvedAt?: Date | string;
}): ParticipantQueuedMessage {
  if (options.message.status !== "queued_pending_sender") {
    throw new Error("only queued_pending_sender messages can be activated");
  }
  const now = validDate(options.now ?? new Date(), "now");
  const requested = validDate(options.message.requestedNotBefore, "requestedNotBefore");
  const allocation = allocateParticipantMessageSlot({
    accounts: options.accounts,
    existingMessages: options.existingMessages,
    notBefore: new Date(Math.max(now.getTime(), requested.getTime())),
    spacingMinutes: options.message.spacingMinutes,
    excludeMessageId: options.message.id
  });
  const approval = participantApproval({
    approvedBy: options.approvedBy,
    approvedAt: options.approvedAt,
    message: options.message.message,
    now
  });
  return {
    ...options.message,
    accountId: allocation.accountId,
    scheduledFor: allocation.scheduledFor,
    status: "scheduled",
    updatedAt: now.toISOString(),
    ...approval
  };
}

export function cancelParticipantMessage(
  message: ParticipantQueuedMessage,
  now: Date | string = new Date()
): ParticipantQueuedMessage {
  if (["dispatching", "sent"].includes(message.status)) {
    throw new Error(`cannot cancel participant message in ${message.status} status`);
  }
  return { ...message, status: "cancelled", updatedAt: validDate(now, "now").toISOString() };
}

export function editParticipantMessage(
  message: ParticipantQueuedMessage,
  text: string,
  now: Date | string = new Date()
): ParticipantQueuedMessage {
  if (!["queued_pending_sender", "scheduled"].includes(message.status)) {
    throw new Error(`cannot edit participant message in ${message.status} status`);
  }
  return {
    ...message,
    message: validateMessage(text),
    status: "queued_pending_sender",
    approvedBy: undefined,
    approvedAt: undefined,
    approvalMessageSha256: undefined,
    updatedAt: validDate(now, "now").toISOString()
  };
}

export function participantMessageSha256(message: string): string {
  return createHash("sha256").update(validateMessage(message), "utf8").digest("hex");
}

export function isParticipantRateLimitSatisfied(times: Array<Date | string>): boolean {
  const ordered = times.map((value) => validDate(value, "scheduled time").getTime()).sort((a, b) => a - b);
  for (let index = 0; index + PARTICIPANT_MESSAGES_PER_ROLLING_HOUR < ordered.length; index += 1) {
    if (ordered[index + PARTICIPANT_MESSAGES_PER_ROLLING_HOUR] - ordered[index] < 60 * 60 * 1000) {
      return false;
    }
  }
  return true;
}

export function isParticipantDailyWindowSatisfied(times: Array<Date | string>): boolean {
  return times.every((value) => {
    const local = participantLocalParts(validDate(value, "scheduled time"));
    return (
      local.hour >= PARTICIPANT_DAILY_WINDOW_START_HOUR &&
      local.hour < PARTICIPANT_DAILY_WINDOW_START_HOUR + PARTICIPANT_DAILY_WINDOW_HOURS
    );
  });
}

export function isParticipantMessageBatchScheduleCurrent(
  value: unknown,
  accountIds: Iterable<string>,
  options: { now: Date | string }
): boolean {
  const batch = objectValue(value);
  const configured = new Set(
    Array.isArray(batch.configuredAccountIds)
      ? batch.configuredAccountIds.filter((item): item is string => typeof item === "string")
      : []
  );
  const requested = new Set(accountIds);
  if (
    batch.schedulePolicyVersion !== PARTICIPANT_SCHEDULE_POLICY_VERSION ||
    configured.size !== requested.size ||
    ![...requested].every((accountId) => configured.has(accountId))
  ) {
    return false;
  }
  const cutoff = validDate(options.now, "now").getTime();
  const accounts = Array.isArray(batch.accounts) ? batch.accounts : [];
  for (const rawAccount of accounts) {
    const account = objectValue(rawAccount);
    if (!["pending", "dispatch_failed"].includes(String(account.status ?? ""))) continue;
    const messages = Array.isArray(account.messages) ? account.messages : [];
    for (const rawMessage of messages) {
      if (rawMessage === null || typeof rawMessage !== "object" || Array.isArray(rawMessage)) {
        return false;
      }
      const scheduledFor = objectValue(rawMessage).scheduledFor;
      const scheduled = typeof scheduledFor === "string" ? new Date(scheduledFor) : null;
      if (!scheduled || Number.isNaN(scheduled.getTime()) || scheduled.getTime() < cutoff) {
        return false;
      }
    }
  }
  return true;
}

function earliestLegalTime(
  messages: ParticipantQueuedMessage[],
  notBefore: Date,
  spacingMinutes: number
): Date {
  const existing = messages
    .map((message) => ({
      time: deliveryTime(message).getTime(),
      spacingMinutes: validateSpacing(message.spacingMinutes || PARTICIPANT_MIN_SPACING_MINUTES)
    }))
    .sort((left, right) => left.time - right.time);
  let candidate = clampToParticipantDailyWindow(notBefore).getTime();
  for (let attempts = 0; attempts < 10000; attempts += 1) {
    const spacingConflict = existing.find((entry) => {
      const requiredGap = Math.max(spacingMinutes, entry.spacingMinutes) * 60 * 1000;
      return Math.abs(candidate - entry.time) < requiredGap;
    });
    if (spacingConflict) {
      candidate = clampToParticipantDailyWindow(
        new Date(spacingConflict.time + Math.max(spacingMinutes, spacingConflict.spacingMinutes) * 60 * 1000)
      ).getTime();
      continue;
    }

    const combined = [...existing.map((entry) => entry.time), candidate].sort((a, b) => a - b);
    let advanced = false;
    for (let index = 0; index + PARTICIPANT_MESSAGES_PER_ROLLING_HOUR < combined.length; index += 1) {
      const endIndex = index + PARTICIPANT_MESSAGES_PER_ROLLING_HOUR;
      if (combined[endIndex] - combined[index] < 60 * 60 * 1000) {
        if (candidate >= combined[index] && candidate <= combined[endIndex]) {
          candidate = clampToParticipantDailyWindow(new Date(combined[index] + 60 * 60 * 1000)).getTime();
          advanced = true;
          break;
        }
      }
    }
    if (advanced) {
      continue;
    }
    return new Date(candidate);
  }
  throw new Error("unable to allocate participant message within scheduling search bound");
}

function clampToParticipantDailyWindow(value: Date): Date {
  const local = participantLocalParts(value);
  const minuteOfDay = local.hour * 60 + local.minute;
  const startMinute = PARTICIPANT_DAILY_WINDOW_START_HOUR * 60;
  const endMinute =
    (PARTICIPANT_DAILY_WINDOW_START_HOUR + PARTICIPANT_DAILY_WINDOW_HOURS) * 60;
  if (minuteOfDay < startMinute) {
    return participantZonedDateTimeToUtc({ ...local, hour: PARTICIPANT_DAILY_WINDOW_START_HOUR, minute: 0, second: 0 });
  }
  if (minuteOfDay >= endMinute) {
    const next = new Date(Date.UTC(local.year, local.month - 1, local.day + 1));
    return participantZonedDateTimeToUtc({
      year: next.getUTCFullYear(),
      month: next.getUTCMonth() + 1,
      day: next.getUTCDate(),
      hour: PARTICIPANT_DAILY_WINDOW_START_HOUR,
      minute: 0,
      second: 0
    });
  }
  return value;
}

type ParticipantLocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const participantWindowFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: PARTICIPANT_DAILY_WINDOW_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit"
});

function participantLocalParts(value: Date): ParticipantLocalParts {
  const values = Object.fromEntries(
    participantWindowFormatter
      .formatToParts(value)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );
  return values as ParticipantLocalParts;
}

function participantZonedDateTimeToUtc(parts: ParticipantLocalParts): Date {
  const target = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  let candidate = target;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const local = participantLocalParts(new Date(candidate));
    const represented = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
    const correction = target - represented;
    candidate += correction;
    if (correction === 0) break;
  }
  return new Date(candidate);
}

function deliveryTime(message: ParticipantQueuedMessage): Date {
  return validDate(message.status === "sent" && message.sentAt ? message.sentAt : message.scheduledFor, "message time");
}

function validateSpacing(value: number): number {
  if (!Number.isInteger(value) || value < PARTICIPANT_MIN_SPACING_MINUTES || value > PARTICIPANT_MAX_SPACING_MINUTES) {
    throw new Error(
      `participant spacing must be an integer from ${PARTICIPANT_MIN_SPACING_MINUTES} to ${PARTICIPANT_MAX_SPACING_MINUTES} minutes`
    );
  }
  return value;
}

function validateMessage(value: string): string {
  const text = requiredText(value, "message");
  if (text.length > 10000) {
    throw new Error("participant message cannot exceed 10000 characters");
  }
  return text;
}

function participantApproval(options: {
  approvedBy?: string;
  approvedAt?: Date | string;
  message: string;
  now: Date;
}): Pick<ParticipantQueuedMessage, "approvedBy" | "approvedAt" | "approvalMessageSha256"> {
  const approvedBy = requiredText(options.approvedBy ?? "", "approvedBy");
  const approvedAt = validDate(options.approvedAt ?? options.now, "approvedAt");
  if (approvedAt.getTime() > options.now.getTime()) {
    throw new Error("approvedAt cannot be in the future");
  }
  return {
    approvedBy,
    approvedAt: approvedAt.toISOString(),
    approvalMessageSha256: participantMessageSha256(options.message)
  };
}

function requiredText(value: string, field: string): string {
  const text = value?.trim();
  if (!text) {
    throw new Error(`${field} is required`);
  }
  return text;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function validDate(value: Date | string, field: string): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${field} must be a valid date/time`);
  }
  return date;
}
