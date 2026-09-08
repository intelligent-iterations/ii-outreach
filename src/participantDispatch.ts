import {
  OUTREACH_PARTICIPANT_BATCH_MAX_WAIT_MS,
  OUTREACH_PARTICIPANT_MESSAGE_BATCH_LIMIT,
  OUTREACH_PARTICIPANT_SINGLE_MESSAGE_MAX_WAIT_MS
} from "./frameworkContract.generated.js";
import {
  participantMessageSha256,
  type ParticipantQueuedMessage
} from "./participantQueue.js";

export const PARTICIPANT_SINGLE_MESSAGE_MAX_WAIT_MS =
  OUTREACH_PARTICIPANT_SINGLE_MESSAGE_MAX_WAIT_MS;
export const PARTICIPANT_BATCH_MAX_WAIT_MS = OUTREACH_PARTICIPANT_BATCH_MAX_WAIT_MS;
export const PARTICIPANT_MESSAGE_BATCH_LIMIT = OUTREACH_PARTICIPANT_MESSAGE_BATCH_LIMIT;

export interface ParticipantDeliveryReceipt {
  senderAccountId: string;
  conversationUrl: string;
  sentAt: Date | string;
  verifiedVia: "reddit_chat_message_readback";
}

export interface ParticipantMessageBatchEntry {
  messageId: string;
  scheduledFor: string;
}

export function validateParticipantMessageBatch(
  value: unknown,
  expected: { batchId: string; accountId: string }
): ParticipantMessageBatchEntry[] {
  const batch = objectValue(value);
  if (
    batch.batchId !== expected.batchId ||
    batch.accountId !== expected.accountId ||
    !Array.isArray(batch.messages) ||
    batch.messages.length > PARTICIPANT_MESSAGE_BATCH_LIMIT
  ) {
    throw new Error("The host returned an invalid participant message batch");
  }
  const seen = new Set<string>();
  const messages = batch.messages.map((raw) => {
    const item = objectValue(raw);
    const messageId = optionalText(item.messageId);
    const scheduledFor = optionalText(item.scheduledFor);
    if (
      !messageId ||
      messageId.length > 180 ||
      seen.has(messageId) ||
      !scheduledFor ||
      Number.isNaN(new Date(scheduledFor).getTime())
    ) {
      throw new Error("The host returned an invalid participant message batch entry");
    }
    seen.add(messageId);
    return { messageId, scheduledFor };
  });
  return messages.sort((left, right) => left.scheduledFor.localeCompare(right.scheduledFor));
}

export function participantDispatchEventFromResult(
  value: unknown,
  binding: { dispatchLeaseId: string; accountId: string }
): Record<string, unknown> {
  const result = objectValue(value);
  const message = objectValue(result.message);
  if (result.status === "sent") {
    return {
      dispatchLeaseId: binding.dispatchLeaseId,
      status: "sent",
      senderAccountId: binding.accountId,
      sentAt: message.sentAt,
      conversationUrl: message.conversationUrl,
      verifiedVia: message.verifiedVia
    };
  }
  const error = objectValue(result.error);
  return {
    dispatchLeaseId: binding.dispatchLeaseId,
    status: result.status === "blocked" ? "blocked" : "failed",
    senderAccountId: binding.accountId,
    errorCode: error.code || "dispatcher_failed",
    error: boundedError(error.message),
    retryable: error.retryable === true,
    deliveryUncertain: error.deliveryUncertain === true
  };
}

export function beginParticipantMessageDispatch(options: {
  message: ParticipantQueuedMessage;
  now?: Date | string;
  alreadyClaimed?: boolean;
}): ParticipantQueuedMessage {
  const now = validDate(options.now ?? new Date(), "now");
  const message = options.message;
  const alreadyClaimed = message.status === "dispatching" && options.alreadyClaimed === true;
  if (message.status !== "scheduled" && !alreadyClaimed) {
    throw new Error("only scheduled participant messages can begin dispatch");
  }
  if (!message.approvedBy || !message.approvedAt || !message.approvalMessageSha256) {
    throw new Error("participant message requires explicit human approval before dispatch");
  }
  if (participantMessageSha256(message.message) !== message.approvalMessageSha256) {
    throw new Error("participant message changed after approval and must be re-approved");
  }
  if (validDate(message.approvedAt, "approvedAt").getTime() > now.getTime()) {
    throw new Error("participant message approval is in the future");
  }
  if (validDate(message.scheduledFor, "scheduledFor").getTime() > now.getTime()) {
    throw new Error("participant message is not due yet");
  }
  if (alreadyClaimed) {
    if (!message.dispatchStartedAt || (message.dispatchAttemptCount ?? 0) < 1) {
      throw new Error("claimed participant message is missing dispatch ownership metadata");
    }
    if (validDate(message.dispatchStartedAt, "dispatchStartedAt").getTime() > now.getTime()) {
      throw new Error("participant message dispatch claim is in the future");
    }
    return message;
  }
  return {
    ...message,
    status: "dispatching",
    dispatchAttemptCount: (message.dispatchAttemptCount ?? 0) + 1,
    dispatchStartedAt: now.toISOString(),
    lastErrorCode: undefined,
    lastError: undefined,
    updatedAt: now.toISOString()
  };
}

export function completeParticipantMessageDispatch(options: {
  message: ParticipantQueuedMessage;
  receipt: ParticipantDeliveryReceipt;
  now?: Date | string;
}): ParticipantQueuedMessage {
  assertDispatching(options.message);
  if (options.receipt.senderAccountId !== options.message.accountId) {
    throw new Error("participant delivery receipt account does not match the scheduled account");
  }
  if (options.receipt.verifiedVia !== "reddit_chat_message_readback") {
    throw new Error("participant delivery requires Reddit chat message readback verification");
  }
  const sentAt = validDate(options.receipt.sentAt, "receipt.sentAt");
  const now = validDate(options.now ?? sentAt, "now");
  if (sentAt.getTime() > now.getTime()) {
    throw new Error("participant delivery receipt cannot be in the future");
  }
  const conversationUrl = redditConversationUrl(options.receipt.conversationUrl);
  return {
    ...options.message,
    status: "sent",
    sentAt: sentAt.toISOString(),
    conversationUrl,
    verifiedVia: options.receipt.verifiedVia,
    updatedAt: now.toISOString()
  };
}

export function failParticipantMessageDispatch(options: {
  message: ParticipantQueuedMessage;
  code: string;
  error: string;
  retryable: boolean;
  deliveryUncertain?: boolean;
  now?: Date | string;
}): ParticipantQueuedMessage {
  assertDispatching(options.message);
  const now = validDate(options.now ?? new Date(), "now");
  return {
    ...options.message,
    status: options.deliveryUncertain || !options.retryable ? "blocked" : "failed",
    lastErrorCode: requiredText(options.code, "code"),
    lastError: requiredText(options.error, "error").slice(0, 2000),
    deliveryUncertain: options.deliveryUncertain === true,
    updatedAt: now.toISOString()
  };
}

function assertDispatching(message: ParticipantQueuedMessage): void {
  if (message.status !== "dispatching") {
    throw new Error("participant message is not dispatching");
  }
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

function boundedError(value: unknown): string {
  return String(value || "The participant dispatcher exited without a receipt.")
    .trim()
    .slice(0, 2000);
}

function redditConversationUrl(value: string): string {
  const text = requiredText(value, "receipt.conversationUrl");
  const url = new URL(text);
  if (url.protocol !== "https:" || !/(^|\.)reddit\.com$/i.test(url.hostname)) {
    throw new Error("participant delivery receipt must use an HTTPS Reddit conversation URL");
  }
  return url.toString();
}

function requiredText(value: string, field: string): string {
  const text = value?.trim();
  if (!text) throw new Error(`${field} is required`);
  return text;
}

function validDate(value: Date | string, field: string): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${field} must be a valid date/time`);
  return date;
}
