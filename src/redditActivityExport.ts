import { createHash } from "node:crypto";

export interface RedditActivityAccountAlias {
  username: string;
  display_username: string;
}

export interface RedditActivityExportRecord {
  id: string;
  account: string;
  display_account: string;
  subreddit: string;
  kind: "comment" | "post";
  action: "comment" | "reply" | "post";
  replied_to?: string;
  time_label: string;
  posted_at_estimate: string;
  time_precision: "day" | "month" | "year";
  title: string;
  message: string;
  score?: number;
  views?: number;
}

export interface RedditActivityExport {
  schema_version: "ii.outreach.reddit.activity-export.v1";
  imported_at: string;
  source_label: string;
  records: RedditActivityExportRecord[];
}

export interface ParseRedditActivityExportOptions {
  importedAt?: string;
  sourceLabel?: string;
  accountAliases?: RedditActivityAccountAlias[];
}

interface RelativeTime {
  estimatedAt: string;
  precision: "day" | "month" | "year";
}

const COMMENT_HEADER = /^([A-Za-z0-9_-]+)(?:\s+OP)?\s+(commented|replied to(?:\s+([A-Za-z0-9_-]+))?)\s+(.+?ago)$/i;
const SUBREDDIT = /^r\/([^\s]+)$/i;
const BULLET = /^\u2022\s*(.*)$/;
const RELATIVE_TIME = /^(\d+)\s+(day|days|mo\.|month|months|yr\.|year|years)\s+ago$/i;

export function parseRedditActivityExport(
  input: string,
  options: ParseRedditActivityExportOptions = {}
): RedditActivityExport {
  const importedAt = validISO(options.importedAt ?? new Date().toISOString(), "importedAt");
  const aliases = new Map(
    (options.accountAliases ?? []).flatMap((alias) => [
      [alias.display_username.toLowerCase(), alias.username],
      [alias.username.toLowerCase(), alias.username]
    ])
  );
  const lines = input.replace(/\r\n?/g, "\n").split("\n").map((line) => line.trimEnd());
  const records: RedditActivityExportRecord[] = [];
  let currentAccount = "";
  let subreddit = "";
  let title = "";

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    const subredditMatch = line.match(SUBREDDIT);
    if (subredditMatch) {
      subreddit = subredditMatch[1];
      const detailIndex = nextNonempty(lines, index + 1);
      const bullet = detailIndex >= 0 ? lines[detailIndex].trim().match(BULLET)?.[1]?.trim() : undefined;
      if (bullet && RELATIVE_TIME.test(bullet)) {
        const parsed = parsePostBlock(lines, index, currentAccount, subreddit, bullet, importedAt, aliases);
        if (parsed) {
          records.push(parsed.record);
          index = parsed.endIndex;
        }
        continue;
      }
      if (bullet) {
        title = bullet;
      }
      continue;
    }

    const header = line.match(COMMENT_HEADER);
    if (!header || !subreddit || !title) {
      continue;
    }
    currentAccount = header[1];
    const endIndex = blockEnd(lines, index + 1);
    const upvoteIndex = findLine(lines, index + 1, endIndex, "Upvote");
    if (upvoteIndex < 0) {
      continue;
    }
    const message = contentBetween(lines, index + 1, upvoteIndex);
    if (!message) {
      continue;
    }
    const relative = parseRelativeTime(header[4], importedAt);
    const action = header[2].toLowerCase().startsWith("replied") ? "reply" : "comment";
    records.push(createRecord({
      displayAccount: currentAccount,
      account: aliases.get(currentAccount.toLowerCase()) ?? currentAccount,
      subreddit,
      kind: "comment",
      action,
      repliedTo: header[3],
      timeLabel: header[4],
      relative,
      title,
      message,
      metrics: readMetrics(lines, upvoteIndex, endIndex)
    }));
    index = endIndex - 1;
  }

  if (records.length === 0) {
    throw new Error("Reddit activity export contained no parseable posts or comments");
  }

  return {
    schema_version: "ii.outreach.reddit.activity-export.v1",
    imported_at: importedAt,
    source_label: options.sourceLabel?.trim() || "reddit-account-activity-paste",
    records
  };
}

function parsePostBlock(
  lines: string[],
  subredditIndex: number,
  displayAccount: string,
  subreddit: string,
  timeLabel: string,
  importedAt: string,
  aliases: Map<string, string>
): { record: RedditActivityExportRecord; endIndex: number } | undefined {
  if (!displayAccount) {
    return undefined;
  }
  const endIndex = blockEnd(lines, subredditIndex + 1);
  const joinIndex = findLine(lines, subredditIndex + 1, endIndex, "Join");
  if (joinIndex < 0) {
    return undefined;
  }
  const titleIndex = nextNonempty(lines, joinIndex + 1);
  if (titleIndex < 0 || titleIndex >= endIndex) {
    return undefined;
  }
  const title = lines[titleIndex].trim();
  const contentEnd = firstMatchingLine(lines, titleIndex + 1, endIndex, new Set(["Repost to another community", "Upvote"]));
  const message = contentBetween(lines, titleIndex + 1, contentEnd);
  const upvoteIndex = findLine(lines, contentEnd, endIndex, "Upvote");
  const metrics = upvoteIndex >= 0 ? readMetrics(lines, upvoteIndex, endIndex) : {};
  return {
    record: createRecord({
      displayAccount,
      account: aliases.get(displayAccount.toLowerCase()) ?? displayAccount,
      subreddit,
      kind: "post",
      action: "post",
      timeLabel,
      relative: parseRelativeTime(timeLabel, importedAt),
      title,
      message,
      metrics
    }),
    endIndex: endIndex - 1
  };
}

function createRecord(input: {
  displayAccount: string;
  account: string;
  subreddit: string;
  kind: "comment" | "post";
  action: "comment" | "reply" | "post";
  repliedTo?: string;
  timeLabel: string;
  relative: RelativeTime;
  title: string;
  message: string;
  metrics: { score?: number; views?: number };
}): RedditActivityExportRecord {
  const fingerprint = [
    input.account,
    input.subreddit,
    input.kind,
    input.action,
    input.repliedTo ?? "",
    input.title,
    input.message,
    input.timeLabel
  ].map(normalizeFingerprintText).join("\n");
  return compact({
    id: `reddit-activity-import-${createHash("sha256").update(fingerprint).digest("hex").slice(0, 20)}`,
    account: input.account,
    display_account: input.displayAccount,
    subreddit: input.subreddit,
    kind: input.kind,
    action: input.action,
    replied_to: input.repliedTo,
    time_label: input.timeLabel,
    posted_at_estimate: input.relative.estimatedAt,
    time_precision: input.relative.precision,
    title: input.title,
    message: input.message,
    score: input.metrics.score,
    views: input.metrics.views
  });
}

function parseRelativeTime(label: string, importedAt: string): RelativeTime {
  const match = label.trim().match(RELATIVE_TIME);
  if (!match) {
    throw new Error(`unsupported Reddit relative time: ${label}`);
  }
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const estimated = new Date(importedAt);
  if (unit.startsWith("day")) {
    estimated.setUTCDate(estimated.getUTCDate() - amount);
    return { estimatedAt: estimated.toISOString(), precision: "day" };
  }
  if (unit === "mo." || unit.startsWith("month")) {
    estimated.setUTCMonth(estimated.getUTCMonth() - amount);
    return { estimatedAt: estimated.toISOString(), precision: "month" };
  }
  estimated.setUTCFullYear(estimated.getUTCFullYear() - amount);
  return { estimatedAt: estimated.toISOString(), precision: "year" };
}

function readMetrics(lines: string[], upvoteIndex: number, endIndex: number): { score?: number; views?: number } {
  let score: number | undefined;
  let views: number | undefined;
  const scoreIndex = nextNonempty(lines, upvoteIndex + 1);
  if (scoreIndex >= 0 && scoreIndex < endIndex && /^-?\d+$/.test(lines[scoreIndex].trim())) {
    score = Number(lines[scoreIndex].trim());
  }
  for (let index = upvoteIndex + 1; index < endIndex; index += 1) {
    const match = lines[index].trim().match(/^([\d,.]+)([KMB]?)\s+views?$/i);
    if (match) {
      const multiplier = match[2].toUpperCase() === "K" ? 1_000 : match[2].toUpperCase() === "M" ? 1_000_000 : match[2].toUpperCase() === "B" ? 1_000_000_000 : 1;
      views = Math.round(Number(match[1].replace(/,/g, "")) * multiplier);
      break;
    }
  }
  return compact({ score, views });
}

function blockEnd(lines: string[], start: number): number {
  for (let index = start; index < lines.length; index += 1) {
    if (SUBREDDIT.test(lines[index].trim())) {
      return index;
    }
  }
  return lines.length;
}

function contentBetween(lines: string[], start: number, end: number): string {
  return lines.slice(start, end).join("\n").trim().replace(/\n{3,}/g, "\n\n");
}

function findLine(lines: string[], start: number, end: number, value: string): number {
  for (let index = start; index < end; index += 1) {
    if (lines[index].trim() === value) {
      return index;
    }
  }
  return -1;
}

function firstMatchingLine(lines: string[], start: number, end: number, values: Set<string>): number {
  for (let index = start; index < end; index += 1) {
    if (values.has(lines[index].trim())) {
      return index;
    }
  }
  return end;
}

function nextNonempty(lines: string[], start: number): number {
  for (let index = start; index < lines.length; index += 1) {
    if (lines[index].trim()) {
      return index;
    }
  }
  return -1;
}

function normalizeFingerprintText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function validISO(value: string, name: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error(`${name} must be an ISO timestamp`);
  }
  return parsed.toISOString();
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}
