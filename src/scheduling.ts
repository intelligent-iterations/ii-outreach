export type LeadApprovalStatus = "new" | "pending" | "approved" | "accepted" | "rejected";
export type RedditOutreachKind = "promo" | "aurafarm";

export interface RedditLead {
  id: string;
  platform?: "reddit";
  status?: LeadApprovalStatus;
  approved?: boolean;
  approvedAt?: string;
  deniedAt?: string;
  denialReason?: string;
  reviewedBy?: string;
  account?: string;
  kind?: RedditOutreachKind;
  outputKind?: RedditOutreachKind;
  output_kind?: RedditOutreachKind;
  deliveryStatus?: string;
  delivery_status?: string;
  reply?: string;
  replyUrl?: string;
  reply_url?: string;
  acceptedAt?: string;
  source?: string;
  subreddit?: string;
  url?: string;
  title?: string;
  notes?: string;
  action?: string;
  actionType?: string;
  action_type?: string;
  username?: string;
  program?: string;
  intent?: string;
  contributionKind?: string;
  contribution_kind?: string;
  strategy?: string;
  templateName?: string;
  template_name?: string;
  templateVariables?: Record<string, string>;
  keyword?: string;
  threadTitle?: string;
  thread_title?: string;
  permalink?: string;
  commentLink?: string;
  targetText?: string;
  target_text?: string;
  commentData?: string;
  proposedReply?: string;
  proposed_reply?: string;
  suggestedContribution?: string;
  suggested_contribution?: string;
  whyHelpful?: string;
  why_helpful?: string;
  safetyNotes?: string;
  safety_notes?: string;
  researchRefresh?: RedditResearchRefresh;
  research_refresh?: RedditResearchRefresh;
  retryReason?: string;
  message?: string;
  lead?: {
    comment_text?: string;
    thread_title?: string;
    permalink?: string;
  };
}

export interface RedditResearchRefresh {
  refreshedAt?: string;
  refreshed_at?: string;
  source?: string;
}

export interface EngagementWindow {
  id: "early" | "mid_morning_break";
  label: string;
  startMinute: number;
  endMinute: number;
}

export interface CreateRedditEngagementScheduleOptions {
  leads: RedditLead[];
  approvedAt?: Date | string;
  generatedAt?: Date | string;
  timeZone?: string;
  seed?: string;
  minLeadCount?: number;
  maxLeadCount?: number;
}

export interface ScheduledRedditEngagement {
  order: number;
  lead: RedditLead;
  window: EngagementWindow["id"];
  scheduledFor: string;
  scheduledLocal: string;
}

export interface RedditEngagementSchedule {
  platform: "reddit";
  timeZone: string;
  generatedAt: string;
  approvedAt: string;
  scheduledDate: string;
  candidateLeadCount: number;
  approvedLeadCount: number;
  slots: ScheduledRedditEngagement[];
}

interface ZonedDateParts {
  year: number;
  month: number;
  day: number;
}

interface ZonedDateTimeParts extends ZonedDateParts {
  hour: number;
  minute: number;
  second: number;
}

const DEFAULT_TIME_ZONE = "America/New_York";
const DEFAULT_MIN_LEADS = 12;
const DEFAULT_MAX_LEADS = 20;

export const REDDIT_ENGAGEMENT_WINDOWS: EngagementWindow[] = [
  {
    id: "early",
    label: "6:00 AM-9:00 AM Eastern",
    startMinute: 6 * 60,
    endMinute: 9 * 60
  },
  {
    id: "mid_morning_break",
    label: "9:00 AM-11:00 AM Eastern",
    startMinute: 9 * 60,
    endMinute: 11 * 60
  }
];

export function createRedditEngagementSchedule(
  options: CreateRedditEngagementScheduleOptions
): RedditEngagementSchedule {
  const timeZone = options.timeZone ?? DEFAULT_TIME_ZONE;
  const minLeadCount = options.minLeadCount ?? DEFAULT_MIN_LEADS;
  const maxLeadCount = options.maxLeadCount ?? DEFAULT_MAX_LEADS;
  const candidateLeads = validateRedditLeadBatch(options.leads, {
    minLeadCount,
    maxLeadCount
  });
  const approvedLeads = candidateLeads.filter(isLeadApproved);
  if (approvedLeads.length === 0) {
    throw new Error("reddit engagement schedule requires at least one approved lead");
  }

  const approvedAt = toValidDate(options.approvedAt ?? new Date(), "approvedAt");
  const generatedAt = toValidDate(options.generatedAt ?? new Date(), "generatedAt");
  const scheduledDate = addCalendarDays(getZonedDateParts(approvedAt, timeZone), 1);
  const seed = options.seed ?? `${formatDate(scheduledDate)}:reddit-engagement`;

  const orderedLeads = [...approvedLeads].sort((left, right) => {
    const leftHash = hashString(`${seed}:${left.id}:${left.url ?? ""}`);
    const rightHash = hashString(`${seed}:${right.id}:${right.url ?? ""}`);
    return leftHash - rightHash || left.id.localeCompare(right.id);
  });
  const scatterMinutes = buildScatterMinutes(orderedLeads.length, seed);

  const slots = orderedLeads
    .map((lead, index): ScheduledRedditEngagement => {
      const mapped = mapOffsetToWindow(scatterMinutes[index]);
      const scheduledFor = zonedTimeToUtc(
        {
          ...scheduledDate,
          hour: Math.floor(mapped.minuteOfDay / 60),
          minute: mapped.minuteOfDay % 60,
          second: 0
        },
        timeZone
      );
      return {
        order: index + 1,
        lead,
        window: mapped.window.id,
        scheduledFor: scheduledFor.toISOString(),
        scheduledLocal: formatZonedDateTime(scheduledFor, timeZone)
      };
    })
    .sort((left, right) => left.scheduledFor.localeCompare(right.scheduledFor))
    .map((slot, index) => ({ ...slot, order: index + 1 }));

  return {
    platform: "reddit",
    timeZone,
    generatedAt: generatedAt.toISOString(),
    approvedAt: approvedAt.toISOString(),
    scheduledDate: formatDate(scheduledDate),
    candidateLeadCount: candidateLeads.length,
    approvedLeadCount: approvedLeads.length,
    slots
  };
}

export function validateRedditLeadBatch(
  leads: RedditLead[],
  options: { minLeadCount?: number; maxLeadCount?: number } = {}
): RedditLead[] {
  if (!Array.isArray(leads)) {
    throw new Error("reddit lead batch must be an array");
  }
  const minLeadCount = options.minLeadCount ?? DEFAULT_MIN_LEADS;
  const maxLeadCount = options.maxLeadCount ?? DEFAULT_MAX_LEADS;
  const redditLeads = leads.filter((lead) => !lead.platform || lead.platform === "reddit");
  if (redditLeads.length < minLeadCount || redditLeads.length > maxLeadCount) {
    throw new Error(
      `reddit lead batch must contain ${minLeadCount}-${maxLeadCount} leads; received ${redditLeads.length}`
    );
  }

  const seenIds = new Set<string>();
  for (const lead of redditLeads) {
    if (!lead.id || typeof lead.id !== "string") {
      throw new Error("each reddit lead requires a string id");
    }
    if (seenIds.has(lead.id)) {
      throw new Error(`duplicate reddit lead id: ${lead.id}`);
    }
    seenIds.add(lead.id);
  }
  return redditLeads;
}

export function isLeadApproved(lead: RedditLead): boolean {
  return lead.status === "approved" || lead.status === "accepted" || lead.approved === true;
}

function buildScatterMinutes(count: number, seed: string): number[] {
  const totalMinutes = REDDIT_ENGAGEMENT_WINDOWS.reduce(
    (total, window) => total + window.endMinute - window.startMinute,
    0
  );
  const step = totalMinutes / count;
  const jitterRange = Math.max(0, Math.min(10, Math.floor(step * 0.25)));
  const used = new Set<number>();

  return Array.from({ length: count }, (_, index) => {
    const centered = Math.floor((index + 0.5) * step);
    const jitter = jitterRange === 0 ? 0 : (hashString(`${seed}:slot:${index}`) % (jitterRange * 2 + 1)) - jitterRange;
    return reserveMinute(clamp(centered + jitter, 0, totalMinutes - 1), used, totalMinutes - 1);
  }).sort((left, right) => left - right);
}

function mapOffsetToWindow(offsetMinute: number): { window: EngagementWindow; minuteOfDay: number } {
  let remaining = offsetMinute;
  for (const window of REDDIT_ENGAGEMENT_WINDOWS) {
    const duration = window.endMinute - window.startMinute;
    if (remaining < duration) {
      return {
        window,
        minuteOfDay: window.startMinute + remaining
      };
    }
    remaining -= duration;
  }
  const last = REDDIT_ENGAGEMENT_WINDOWS[REDDIT_ENGAGEMENT_WINDOWS.length - 1];
  return {
    window: last,
    minuteOfDay: last.endMinute - 1
  };
}

function reserveMinute(target: number, used: Set<number>, maxMinute: number): number {
  if (!used.has(target)) {
    used.add(target);
    return target;
  }
  for (let radius = 1; radius <= maxMinute; radius += 1) {
    const forward = target + radius;
    if (forward <= maxMinute && !used.has(forward)) {
      used.add(forward);
      return forward;
    }
    const backward = target - radius;
    if (backward >= 0 && !used.has(backward)) {
      used.add(backward);
      return backward;
    }
  }
  throw new Error("unable to reserve unique engagement minute");
}

function zonedTimeToUtc(parts: ZonedDateTimeParts, timeZone: string): Date {
  const targetAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  let guess = targetAsUtc;
  for (let index = 0; index < 4; index += 1) {
    const actualParts = getZonedDateTimeParts(new Date(guess), timeZone);
    const actualAsUtc = Date.UTC(
      actualParts.year,
      actualParts.month - 1,
      actualParts.day,
      actualParts.hour,
      actualParts.minute,
      actualParts.second
    );
    const delta = targetAsUtc - actualAsUtc;
    if (delta === 0) {
      break;
    }
    guess += delta;
  }
  return new Date(guess);
}

function getZonedDateParts(date: Date, timeZone: string): ZonedDateParts {
  const parts = getZonedDateTimeParts(date, timeZone);
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day
  };
}

function getZonedDateTimeParts(date: Date, timeZone: string): ZonedDateTimeParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second)
  };
}

function formatZonedDateTime(date: Date, timeZone: string): string {
  const parts = getZonedDateTimeParts(date, timeZone);
  const timeZoneName = getTimeZoneName(date, timeZone);
  return `${formatDate(parts)} ${pad(parts.hour)}:${pad(parts.minute)} ${timeZoneName}`;
}

function getTimeZoneName(date: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "short"
  });
  const part = formatter.formatToParts(date).find((entry) => entry.type === "timeZoneName");
  return part?.value ?? timeZone;
}

function addCalendarDays(parts: ZonedDateParts, days: number): ZonedDateParts {
  const next = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate()
  };
}

function formatDate(parts: ZonedDateParts): string {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

function toValidDate(value: Date | string, fieldName: string): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} must be a valid ISO date/time`);
  }
  return date;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
