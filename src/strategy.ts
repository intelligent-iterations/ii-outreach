import type { RedditLead, RedditOutreachKind } from "./scheduling.js";

export type RedditStrategyVersion = "strategy-v2";
export type RedditStrategyNextAction = "run_promo" | "run_aurafarm";
export type RedditSubredditDiscoveryStatus = "needs_aurafarm" | "complete";
export type RedditSubredditScheduleStatus = "ready" | "skip_no_accepted_aurafarm";

export interface RedditStrategyRecord extends RedditLead {
  kind?: RedditOutreachKind;
  outputKind?: RedditOutreachKind;
  output_kind?: RedditOutreachKind;
  status?: RedditLead["status"] | "accepted";
}

export interface RedditStrategyStateInput {
  version?: string;
  records?: RedditStrategyRecord[];
  leads?: RedditStrategyRecord[];
}

export interface CreateRedditStrategyPlanOptions {
  records?: RedditStrategyRecord[];
  state?: RedditStrategyStateInput | RedditStrategyRecord[];
  legacyAcceptedPromoRecords?: RedditStrategyRecord[];
  generatedAt?: Date | string;
  quotaMultiplier?: number;
}

export interface RedditSubredditStrategyPlan {
  subreddit: string;
  acceptedPromoCount: number;
  acceptedPromoIds: string[];
  targetAurafarmCount: number;
  existingAurafarmCount: number;
  remainingAurafarmCount: number;
  acceptedAurafarmCount: number;
  pendingScheduleAurafarmCount: number;
  pendingScheduleAurafarmIds: string[];
  discoveryStatus: RedditSubredditDiscoveryStatus;
  scheduleStatus: RedditSubredditScheduleStatus;
}

export interface RedditStrategyPlan {
  platform: "reddit";
  version: RedditStrategyVersion;
  generatedAt: string;
  nextAction: RedditStrategyNextAction;
  acceptedPromoCount: number;
  acceptedPromoSubredditCount: number;
  quotaMultiplier: number;
  subreddits: RedditSubredditStrategyPlan[];
}

const VERSION: RedditStrategyVersion = "strategy-v2";
const DEFAULT_QUOTA_MULTIPLIER = 4;

const COMPLETE_DELIVERY_STATUSES = new Set(["queued", "sent", "posted", "delivered", "complete", "completed"]);
const FAILED_DELIVERY_STATUSES = new Set(["failed", "rejected", "denied", "skipped"]);

export function createRedditStrategyPlan(options: CreateRedditStrategyPlanOptions = {}): RedditStrategyPlan {
  const quotaMultiplier = positiveInteger(options.quotaMultiplier ?? DEFAULT_QUOTA_MULTIPLIER, "quotaMultiplier");
  const generatedAt = toValidDate(options.generatedAt ?? new Date(), "generatedAt");
  const stateRecords = [
    ...normalizeRedditStrategyRecords(options.state ?? []),
    ...(options.records ?? []),
    ...importAcceptedQueuedPromoRecords(options.legacyAcceptedPromoRecords ?? [])
  ];

  const acceptedPromos = stateRecords.filter(isAcceptedPromoSeed);
  const promoGroups = groupBySubreddit(acceptedPromos);
  const subreddits = [...promoGroups.keys()].sort((left, right) => left.localeCompare(right));

  return {
    platform: "reddit",
    version: VERSION,
    generatedAt: generatedAt.toISOString(),
    nextAction: subreddits.length === 0 ? "run_promo" : "run_aurafarm",
    acceptedPromoCount: acceptedPromos.length,
    acceptedPromoSubredditCount: subreddits.length,
    quotaMultiplier,
    subreddits: subreddits.map((subreddit) =>
      createSubredditPlan({
        subreddit,
        acceptedPromos: promoGroups.get(subreddit) ?? [],
        allRecords: stateRecords,
        quotaMultiplier
      })
    )
  };
}

export function normalizeRedditStrategyRecords(input: RedditStrategyStateInput | RedditStrategyRecord[]): RedditStrategyRecord[] {
  if (Array.isArray(input)) {
    return input;
  }
  if (Array.isArray(input.records)) {
    return input.records;
  }
  if (Array.isArray(input.leads)) {
    return input.leads;
  }
  return [];
}

export function importAcceptedQueuedPromoRecords(records: RedditStrategyRecord[]): RedditStrategyRecord[] {
  return records.filter(isImportableAcceptedQueuedPromo).map((record) => ({
    ...record,
    kind: "promo",
    status: record.status === "accepted" ? "approved" : record.status,
    approved: true,
    source: record.source ?? "legacy_queued_promo_import"
  }));
}

export function redditStrategyKind(record: RedditStrategyRecord): RedditOutreachKind | undefined {
  return record.kind ?? record.outputKind ?? record.output_kind;
}

function createSubredditPlan(options: {
  subreddit: string;
  acceptedPromos: RedditStrategyRecord[];
  allRecords: RedditStrategyRecord[];
  quotaMultiplier: number;
}): RedditSubredditStrategyPlan {
  const targetAurafarmCount = options.acceptedPromos.length * options.quotaMultiplier;
  const sameSubredditAurafarm = options.allRecords.filter(
    (record) => redditStrategyKind(record) === "aurafarm" && normalizedSubreddit(record) === options.subreddit
  );
  const existingAurafarm = sameSubredditAurafarm.filter((record) => !isRejectedOrFailed(record));
  const acceptedAurafarm = sameSubredditAurafarm.filter(isAcceptedAurafarm);
  const pendingScheduleAurafarm = acceptedAurafarm.filter(needsDelivery);
  const remainingAurafarmCount = Math.max(0, targetAurafarmCount - existingAurafarm.length);

  return {
    subreddit: options.subreddit,
    acceptedPromoCount: options.acceptedPromos.length,
    acceptedPromoIds: options.acceptedPromos.map((record) => record.id).sort((left, right) => left.localeCompare(right)),
    targetAurafarmCount,
    existingAurafarmCount: existingAurafarm.length,
    remainingAurafarmCount,
    acceptedAurafarmCount: acceptedAurafarm.length,
    pendingScheduleAurafarmCount: pendingScheduleAurafarm.length,
    pendingScheduleAurafarmIds: pendingScheduleAurafarm
      .map((record) => record.id)
      .sort((left, right) => left.localeCompare(right)),
    discoveryStatus: remainingAurafarmCount > 0 ? "needs_aurafarm" : "complete",
    scheduleStatus: pendingScheduleAurafarm.length > 0 ? "ready" : "skip_no_accepted_aurafarm"
  };
}

function isAcceptedPromoSeed(record: RedditStrategyRecord): boolean {
  return redditStrategyKind(record) === "promo" && Boolean(normalizedSubreddit(record)) && isAccepted(record);
}

function isImportableAcceptedQueuedPromo(record: RedditStrategyRecord): boolean {
  const kind = redditStrategyKind(record);
  return (
    (!kind || kind === "promo") &&
    Boolean(normalizedSubreddit(record)) &&
    isAccepted(record) &&
    hasReply(record) &&
    !isRejectedOrFailed(record)
  );
}

function isAcceptedAurafarm(record: RedditStrategyRecord): boolean {
  return redditStrategyKind(record) === "aurafarm" && isAccepted(record) && !isRejectedOrFailed(record);
}

function isAccepted(record: RedditStrategyRecord): boolean {
  return record.status === "approved" || record.status === "accepted" || record.approved === true;
}

function isRejectedOrFailed(record: RedditStrategyRecord): boolean {
  if (record.status === "rejected") {
    return true;
  }
  const deliveryStatus = normalizedDeliveryStatus(record);
  return deliveryStatus ? FAILED_DELIVERY_STATUSES.has(deliveryStatus) : false;
}

function needsDelivery(record: RedditStrategyRecord): boolean {
  const deliveryStatus = normalizedDeliveryStatus(record);
  return !deliveryStatus || !COMPLETE_DELIVERY_STATUSES.has(deliveryStatus);
}

function hasReply(record: RedditStrategyRecord): boolean {
  return Boolean(firstText(record.reply, record.proposedReply, record.message));
}

function groupBySubreddit(records: RedditStrategyRecord[]): Map<string, RedditStrategyRecord[]> {
  const out = new Map<string, RedditStrategyRecord[]>();
  for (const record of records) {
    const subreddit = normalizedSubreddit(record);
    if (!subreddit) {
      continue;
    }
    const group = out.get(subreddit) ?? [];
    group.push(record);
    out.set(subreddit, group);
  }
  return out;
}

function normalizedSubreddit(record: RedditStrategyRecord): string | undefined {
  const raw = record.subreddit?.trim().replace(/^r\//i, "");
  return raw ? raw : undefined;
}

function normalizedDeliveryStatus(record: RedditStrategyRecord): string | undefined {
  return firstText(record.deliveryStatus, record.delivery_status)?.toLowerCase();
}

function firstText(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return undefined;
}

function positiveInteger(value: number, fieldName: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }
  return value;
}

function toValidDate(value: Date | string, fieldName: string): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} must be a valid ISO date/time`);
  }
  return date;
}
