import type { RedditApprovalDecisionStatus } from "./approval.js";
import type { RedditLead } from "./scheduling.js";

export type RedditReviewHistoryStatus =
  | RedditApprovalDecisionStatus
  | "retry_requested"
  | "replacement_approved";

export interface RedditReviewHistoryRecord {
  key?: string;
  queueId: string;
  leadId: string;
  status: RedditReviewHistoryStatus;
  recordedAt: string;
  decidedAt?: string;
  reviewer?: string;
  source?: string;
  reason?: string;
  slackChannel?: string;
  slackThreadTs?: string;
  lead?: RedditLead;
  decision?: Record<string, unknown>;
}

const HEADER = [
  "# Reddit Review History",
  "",
  "This ledger is written by ii-outreach after human review decisions from the host application. The tmux reply selector reads it as examples of approved and denied outreach so future template selection improves without changing lead identity or target URLs. Legacy Slack metadata is retained only when importing historical records.",
  ""
].join("\n");

export function redditReviewHistoryKey(record: RedditReviewHistoryRecord): string {
  return [
    record.queueId,
    record.leadId,
    record.status,
    record.decidedAt ?? record.source ?? "unknown",
    record.reviewer ?? "",
    record.reason ?? ""
  ].join(":");
}

export function readRedditReviewHistory(markdown: string): RedditReviewHistoryRecord[] {
  const records: RedditReviewHistoryRecord[] = [];
  for (const match of markdown.matchAll(/<!--\s*reddit-review-history-entry\s*([\s\S]*?)\s*-->/g)) {
    try {
      const parsed = JSON.parse(match[1].trim()) as Partial<RedditReviewHistoryRecord>;
      if (
        typeof parsed.queueId === "string" &&
        typeof parsed.leadId === "string" &&
        (
          parsed.status === "approved" ||
          parsed.status === "rejected" ||
          parsed.status === "retry_requested" ||
          parsed.status === "replacement_approved"
        ) &&
        typeof parsed.recordedAt === "string"
      ) {
        records.push(parsed as RedditReviewHistoryRecord);
      }
    } catch {
      // Keep the human ledger readable even if a hand-edited entry is malformed.
    }
  }
  return records;
}

export function appendRedditReviewHistoryRecord(
  markdown: string,
  record: RedditReviewHistoryRecord
): string {
  const normalized = {
    ...record,
    key: record.key ?? redditReviewHistoryKey(record)
  };
  if (readRedditReviewHistory(markdown).some((item) => item.key === normalized.key)) {
    return markdown || HEADER;
  }
  const body = markdown.trim() ? `${markdown.trimEnd()}\n\n` : HEADER;
  return `${body}${renderRedditReviewHistoryRecord(normalized)}`;
}

export function renderRedditReviewHistoryRecord(record: RedditReviewHistoryRecord): string {
  const marker = JSON.stringify({
    key: record.key ?? redditReviewHistoryKey(record),
    queueId: record.queueId,
    leadId: record.leadId,
    status: record.status,
    recordedAt: record.recordedAt
  });
  const lead = record.lead ?? { id: record.leadId };
  const targetUrl = lead.commentLink ?? lead.permalink ?? lead.url;
  const reply = lead.message ?? lead.proposedReply;
  const commentData = lead.commentData ?? lead.targetText ?? lead.target_text ?? lead.lead?.comment_text;
  return [
    `<!-- reddit-review-history-entry ${marker} -->`,
    `## ${record.recordedAt} - ${record.status} - ${record.leadId}`,
    "",
    `- Queue: \`${record.queueId}\``,
    `- Target: ${targetUrl ?? ""}`,
    lead.subreddit ? `- Subreddit: r/${lead.subreddit}` : undefined,
    lead.templateName || lead.template_name ? `- Template: \`${lead.templateName ?? lead.template_name}\`` : undefined,
    lead.keyword ? `- Keyword: ${lead.keyword}` : undefined,
    record.reviewer ? `- Reviewer: \`${record.reviewer}\`` : undefined,
    record.decidedAt ? `- Decided at: \`${record.decidedAt}\`` : undefined,
    record.reason ? `- ${reviewReasonLabel(record.status)}: ${record.reason}` : undefined,
    lead.threadTitle || lead.thread_title || lead.title ? `- Thread: ${lead.threadTitle ?? lead.thread_title ?? lead.title}` : undefined,
    commentData ? `\n### Comment Data\n\n${commentData}` : undefined,
    reply ? `\n### Proposed Reply\n\n${reply}` : undefined,
    `\n### Full Context\n\n\`\`\`json\n${JSON.stringify(record, null, 2)}\n\`\`\``,
    ""
  ].filter((line): line is string => line !== undefined).join("\n");
}

function reviewReasonLabel(status: RedditReviewHistoryStatus): string {
  if (status === "retry_requested") {
    return "Retry critique";
  }
  if (status === "replacement_approved") {
    return "Replacement reply";
  }
  return "Denial reason";
}
