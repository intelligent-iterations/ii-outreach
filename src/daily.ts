import {
  createRedditEngagementSchedule,
  isLeadApproved,
  REDDIT_ENGAGEMENT_WINDOWS,
  type RedditEngagementSchedule,
  type RedditLead,
  validateRedditLeadBatch
} from "./scheduling.js";
import {
  filterRedditLeadsNotPosted,
  readRedditPostedLedger,
  type RedditPostedLedgerRecord
} from "./redditPostedLedger.js";
import { normalizeRedditLeadTemplates, type RedditTemplateCatalog } from "./redditTemplates.js";

export interface CreateRedditDailyEngagementPlanOptions {
  leads: RedditLead[];
  generatedAt?: Date | string;
  approvedAt?: Date | string;
  timeZone?: string;
  seed?: string;
  minLeadCount?: number;
  maxLeadCount?: number;
  postedLedgerMarkdown?: string;
  postedLedgerRecords?: RedditPostedLedgerRecord[];
  templateCatalog?: RedditTemplateCatalog;
  preserveSelectedReplies?: boolean;
}

export interface RedditApprovalQueueItem {
  id: string;
  subreddit?: string;
  url?: string;
  title?: string;
  notes?: string;
  kind?: string;
  deliveryStatus?: string;
  replyUrl?: string;
  acceptedAt?: string;
  source?: string;
  action?: string;
  username?: string;
  strategy?: string;
  templateName?: string;
  keyword?: string;
  threadTitle?: string;
  commentLink?: string;
  commentData?: string;
  proposedReply?: string;
  whyHelpful?: string;
  safetyNotes?: string;
  researchRefresh?: {
    refreshedAt?: string;
    refreshed_at?: string;
    source?: string;
  };
  status: "pending_approval" | "approved" | "rejected";
  approvedAt?: string;
  deniedAt?: string;
  denialReason?: string;
  reviewedBy?: string;
}

export interface RedditApprovalQueue {
  platform: "reddit";
  status: "awaiting_approval";
  timeZone: string;
  generatedAt: string;
  candidateLeadCount: number;
  requiredLeadCount: {
    min: number;
    max: number;
  };
  schedulingRule: {
    target: "next_day_after_approval";
    windows: typeof REDDIT_ENGAGEMENT_WINDOWS;
  };
  leads: RedditApprovalQueueItem[];
}

export type RedditDailyEngagementPlan =
  | {
      platform: "reddit";
      status: "awaiting_approval";
      approvalQueue: RedditApprovalQueue;
      schedule?: never;
    }
  | {
      platform: "reddit";
      status: "scheduled";
      approvalQueue: RedditApprovalQueue;
      schedule: RedditEngagementSchedule;
    };

const DEFAULT_TIME_ZONE = "America/New_York";
const DEFAULT_MIN_LEADS = 12;
const DEFAULT_MAX_LEADS = 20;

export function createRedditDailyEngagementPlan(
  options: CreateRedditDailyEngagementPlanOptions
): RedditDailyEngagementPlan {
  const timeZone = options.timeZone ?? DEFAULT_TIME_ZONE;
  const minLeadCount = options.minLeadCount ?? DEFAULT_MIN_LEADS;
  const maxLeadCount = options.maxLeadCount ?? DEFAULT_MAX_LEADS;
  const generatedAt = toValidDate(options.generatedAt ?? new Date(), "generatedAt");
  const postedRecords = options.postedLedgerRecords ??
    (options.postedLedgerMarkdown ? readRedditPostedLedger(options.postedLedgerMarkdown) : []);
  const notPreviouslyPosted = filterRedditLeadsNotPosted(options.leads, postedRecords);
  const candidateLeads = validateRedditLeadBatch(normalizeRedditLeadTemplates(notPreviouslyPosted, {
    catalog: options.templateCatalog,
    preserveSelectedReply: options.preserveSelectedReplies,
  }), {
    minLeadCount,
    maxLeadCount
  });
  const approvalQueue = createRedditApprovalQueue({
    leads: candidateLeads,
    generatedAt,
    timeZone,
    minLeadCount,
    maxLeadCount
  });
  const approvedLeads = candidateLeads.filter(isLeadApproved);
  if (approvedLeads.length === 0) {
    return {
      platform: "reddit",
      status: "awaiting_approval",
      approvalQueue
    };
  }

  return {
    platform: "reddit",
    status: "scheduled",
    approvalQueue,
    schedule: createRedditEngagementSchedule({
      leads: candidateLeads,
      approvedAt: options.approvedAt ?? generatedAt,
      generatedAt,
      timeZone,
      seed: options.seed,
      minLeadCount,
      maxLeadCount
    })
  };
}

export function createRedditApprovalQueue(options: {
  leads: RedditLead[];
  generatedAt?: Date | string;
  timeZone?: string;
  minLeadCount?: number;
  maxLeadCount?: number;
}): RedditApprovalQueue {
  const timeZone = options.timeZone ?? DEFAULT_TIME_ZONE;
  const minLeadCount = options.minLeadCount ?? DEFAULT_MIN_LEADS;
  const maxLeadCount = options.maxLeadCount ?? DEFAULT_MAX_LEADS;
  const generatedAt = toValidDate(options.generatedAt ?? new Date(), "generatedAt");
  const leads = validateRedditLeadBatch(options.leads, {
    minLeadCount,
    maxLeadCount
  });
  return {
    platform: "reddit",
    status: "awaiting_approval",
    timeZone,
    generatedAt: generatedAt.toISOString(),
    candidateLeadCount: leads.length,
    requiredLeadCount: {
      min: minLeadCount,
      max: maxLeadCount
    },
    schedulingRule: {
      target: "next_day_after_approval",
      windows: REDDIT_ENGAGEMENT_WINDOWS
    },
    leads: leads.map(toApprovalQueueItem)
  };
}

function toApprovalQueueItem(lead: RedditLead): RedditApprovalQueueItem {
  return {
    id: lead.id,
    subreddit: lead.subreddit,
    url: lead.url,
    title: lead.title,
    notes: lead.notes,
    kind: lead.kind ?? lead.outputKind ?? lead.output_kind,
    deliveryStatus: lead.deliveryStatus ?? lead.delivery_status,
    replyUrl: lead.replyUrl ?? lead.reply_url,
    acceptedAt: lead.acceptedAt,
    source: lead.source,
    action: lead.action ?? lead.actionType ?? lead.action_type,
    username: lead.username,
    strategy: lead.strategy,
    templateName: lead.templateName ?? lead.template_name,
    keyword: lead.keyword,
    threadTitle: lead.threadTitle ?? lead.thread_title ?? lead.lead?.thread_title,
    commentLink: lead.commentLink ?? lead.permalink ?? lead.lead?.permalink,
    commentData: lead.commentData ?? lead.targetText ?? lead.target_text ?? lead.lead?.comment_text,
    proposedReply: lead.proposedReply ?? lead.message,
    whyHelpful: lead.whyHelpful ?? lead.why_helpful,
    safetyNotes: lead.safetyNotes ?? lead.safety_notes,
    researchRefresh: lead.researchRefresh ?? lead.research_refresh,
    status: lead.status === "rejected" ? "rejected" : isLeadApproved(lead) ? "approved" : "pending_approval",
    approvedAt: lead.approvedAt,
    deniedAt: lead.deniedAt,
    denialReason: lead.denialReason,
    reviewedBy: lead.reviewedBy
  };
}

function toValidDate(value: Date | string, fieldName: string): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} must be a valid ISO date/time`);
  }
  return date;
}
