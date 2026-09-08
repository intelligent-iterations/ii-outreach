import type { RedditLead } from "./scheduling.js";

export interface RedditPostedLedgerRecord {
  leadId: string;
  targetUrl?: string;
  targetKey?: string;
  postedUrl?: string;
  commentId?: string;
  account?: string;
  subreddit?: string;
  templateName?: string;
  keyword?: string;
  queueId?: string;
  postedAt: string;
  message?: string;
  commentData?: string;
  threadTitle?: string;
  lead?: RedditLead;
  action?: Record<string, unknown>;
  dispatchResult?: Record<string, unknown>;
}

const HEADER = [
  "# Posted Reddit Outreach",
  "",
  "This ledger is written by ii-outreach after a real Reddit comment posts. Lead gathering and daily planning read it to remove already-contacted Reddit targets before review.",
  ""
].join("\n");

export function redditPostedTargetKey(value: string | undefined): string | undefined {
  if (!value?.trim()) {
    return undefined;
  }
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    const commentsIndex = parts.findIndex((part) => part.toLowerCase() === "comments");
    if (commentsIndex >= 0 && parts[commentsIndex + 1]) {
      const postId = parts[commentsIndex + 1].toLowerCase();
      const commentId = parts[commentsIndex + 3]?.toLowerCase();
      return commentId ? `reddit:comment:${postId}:${commentId}` : `reddit:post:${postId}`;
    }
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/+$/, "").toLowerCase();
  } catch {
    return value.trim().replace(/\/+$/, "").toLowerCase();
  }
}

export function redditLeadTargetKey(lead: RedditLead): string | undefined {
  return redditPostedTargetKey(lead.commentLink ?? lead.permalink ?? lead.url);
}

export function readRedditPostedLedger(markdown: string): RedditPostedLedgerRecord[] {
  const records: RedditPostedLedgerRecord[] = [];
  for (const match of markdown.matchAll(/<!--\s*reddit-posted-ledger-entry\s*([\s\S]*?)\s*-->/g)) {
    try {
      const parsed = JSON.parse(match[1].trim()) as Partial<RedditPostedLedgerRecord>;
      if (typeof parsed.leadId === "string" && typeof parsed.postedAt === "string") {
        records.push({
          leadId: parsed.leadId,
          targetUrl: text(parsed.targetUrl),
          targetKey: text(parsed.targetKey) ?? redditPostedTargetKey(parsed.targetUrl),
          postedUrl: text(parsed.postedUrl),
          commentId: text(parsed.commentId),
          account: text(parsed.account),
          subreddit: text(parsed.subreddit),
          templateName: text(parsed.templateName),
          keyword: text(parsed.keyword),
          queueId: text(parsed.queueId),
          postedAt: parsed.postedAt,
          message: text(parsed.message),
          commentData: text(parsed.commentData),
          threadTitle: text(parsed.threadTitle),
          lead: object(parsed.lead) as RedditLead | undefined,
          action: object(parsed.action),
          dispatchResult: object(parsed.dispatchResult)
        });
      }
    } catch {
      // Keep the human ledger readable even if a hand-edited entry is malformed.
    }
  }
  return records;
}

export function filterRedditLeadsNotPosted(leads: RedditLead[], records: RedditPostedLedgerRecord[]): RedditLead[] {
  const postedIds = new Set(records.map((record) => record.leadId).filter(Boolean));
  const postedTargets = new Set(records.map((record) => record.targetKey ?? redditPostedTargetKey(record.targetUrl)).filter(Boolean));
  return leads.filter((lead) => {
    if (postedIds.has(lead.id)) {
      return false;
    }
    const targetKey = redditLeadTargetKey(lead);
    return !targetKey || !postedTargets.has(targetKey);
  });
}

export function appendRedditPostedLedgerRecord(
  markdown: string,
  record: RedditPostedLedgerRecord
): string {
  const existing = readRedditPostedLedger(markdown);
  const normalized: RedditPostedLedgerRecord = {
    ...record,
    targetKey: record.targetKey ?? redditPostedTargetKey(record.targetUrl)
  };
  if (
    existing.some((item) =>
      item.leadId === normalized.leadId ||
      Boolean(normalized.targetKey && item.targetKey === normalized.targetKey) ||
      Boolean(normalized.postedUrl && item.postedUrl === normalized.postedUrl)
    )
  ) {
    return markdown || HEADER;
  }

  const body = markdown.trim() ? `${markdown.trimEnd()}\n\n` : HEADER;
  return `${body}${renderRedditPostedLedgerRecord(normalized)}`;
}

export function renderRedditPostedLedgerRecord(record: RedditPostedLedgerRecord): string {
  const json = JSON.stringify({
    leadId: record.leadId,
    targetUrl: record.targetUrl,
    targetKey: record.targetKey,
    postedUrl: record.postedUrl,
    postedAt: record.postedAt
  });
  return [
    `<!-- reddit-posted-ledger-entry ${json} -->`,
    `## ${record.postedAt} - ${record.leadId}`,
    "",
    `- Target: ${record.targetUrl ?? ""}`,
    `- Target key: \`${record.targetKey ?? ""}\``,
    `- Posted comment: ${record.postedUrl ?? ""}`,
    record.commentId ? `- Comment ID: \`${record.commentId}\`` : undefined,
    record.account ? `- Account: \`${record.account}\`` : undefined,
    record.subreddit ? `- Subreddit: r/${record.subreddit}` : undefined,
    record.templateName ? `- Template: \`${record.templateName}\`` : undefined,
    record.keyword ? `- Keyword: ${record.keyword}` : undefined,
    record.queueId ? `- Queue: \`${record.queueId}\`` : undefined,
    record.threadTitle ? `- Thread: ${record.threadTitle}` : undefined,
    record.commentData ? `\n### Comment Data\n\n${record.commentData}` : undefined,
    record.message ? `\n### Posted Reply\n\n${record.message}` : undefined,
    `\n### Full Context\n\n\`\`\`json\n${JSON.stringify(record, null, 2)}\n\`\`\``,
    ""
  ].filter((line): line is string => line !== undefined).join("\n");
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
