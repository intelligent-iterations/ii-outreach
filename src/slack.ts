import type { RedditApprovalQueueItem, RedditDailyEngagementPlan } from "./daily.js";

/** @deprecated Outreach review belongs to the host application. Retained for historical migration only. */
export interface RedditSlackReviewMessageOptions {
  runUrl?: string;
  artifactUrl?: string;
  occurrenceId?: string;
}

export interface RedditSlackMessage {
  id?: string;
  text: string;
  blocks?: SlackBlock[];
}

export interface RedditSlackReviewMessages {
  parent: RedditSlackMessage;
  threadReplies: RedditSlackMessage[];
}

export interface RedditDispatchNotificationAction {
  id?: string;
  platform?: string;
  action?: string;
  actionType?: string;
  action_type?: string;
  account?: string;
  actualAccount?: string;
  actual_account?: string;
  username?: string;
  subreddit?: string;
  strategy?: string;
  templateName?: string;
  template_name?: string;
  keyword?: string;
  threadTitle?: string;
  thread_title?: string;
  permalink?: string;
  commentLink?: string;
  url?: string;
  commentData?: string;
  comment_data?: string;
  proposedReply?: string;
  proposed_reply?: string;
  message?: string;
  postedUrl?: string;
  posted_url?: string;
  dispatchResult?: RedditDispatchResult;
  dispatch_result?: RedditDispatchResult;
}

export interface RedditDispatchResult {
  account?: string;
  username?: string;
  postedUrl?: string;
  posted_url?: string;
  commentId?: string;
  comment_id?: string;
  parent?: string;
  runUrl?: string;
  run_url?: string;
}

export type SlackBlock = Record<string, unknown>;

const REDDIT_OUTREACH_APPROVE_ACTION_ID = "ii_outreach_reddit_approve";
const REDDIT_OUTREACH_REJECT_ACTION_ID = "ii_outreach_reddit_reject";
const REDDIT_OUTREACH_APPROVE_ALL_ACTION_ID = "ii_outreach_reddit_approve_all";
const SLACK_MRKDWN_SECTION_TEXT_LIMIT = 3000;

/** @deprecated Outreach review belongs to the host application. Retained for historical migration only. */
export function renderRedditSlackReviewMessages(
  plan: RedditDailyEngagementPlan,
  options: RedditSlackReviewMessageOptions = {}
): RedditSlackReviewMessages {
  if (plan.status === "scheduled") {
    return renderScheduledMessages(plan, options);
  }

  const queue = plan.approvalQueue;
  const parentText = compactLines([
    "*Reddit outreach requests need review*",
    `Status: \`${queue.status}\``,
    `Leads gathered: ${queue.candidateLeadCount} (${queue.requiredLeadCount.min}-${queue.requiredLeadCount.max} required)`,
    `Schedule after approval: next Eastern day, 6:00 AM-9:00 AM or 9:00 AM-11:00 AM`,
    options.occurrenceId ? `Occurrence: \`${escapeSlackText(options.occurrenceId)}\`` : undefined,
    options.runUrl ? `Run: ${escapeSlackText(options.runUrl)}` : undefined,
    options.artifactUrl ? `Artifact: ${escapeSlackText(options.artifactUrl)}` : undefined,
    "Approve by clicking each lead's button or reacting with `:white_check_mark:`.",
    "Deny by clicking Deny and entering a reason, or reply `reject <lead-id> <reason>` in the thread.",
    "Thread commands also work: `approve all` and `approve <lead-id>`."
  ]);

  return {
    parent: {
      text: parentText,
      blocks: [
        markdownSection(parentText),
        actionsBlock([
          buttonElement({
            text: "Approve all",
            actionId: REDDIT_OUTREACH_APPROVE_ALL_ACTION_ID,
            style: "primary",
            value: {
              kind: "reddit_outreach_bulk_decision",
              queueId: queueId(options),
              decision: "approved"
            }
          })
        ])
      ]
    },
    threadReplies: queue.leads.map((lead, index) => renderLeadReviewMessage(lead, index, queue.leads.length, options))
  };
}

export function renderRedditDispatchNotification(action: RedditDispatchNotificationAction): string {
  const dispatch = action.dispatchResult ?? action.dispatch_result ?? {};
  const platform = firstText(action.platform) ?? "reddit";
  const actionName = firstText(action.action, action.actionType, action.action_type);
  const postedUrl = firstText(dispatch.postedUrl, dispatch.posted_url, action.postedUrl, action.posted_url);
  const actualAccount = firstText(dispatch.account, dispatch.username, action.actualAccount, action.actual_account);
  const scheduledAccount = firstText(action.account);
  const account = renderDispatchAccount(actualAccount, scheduledAccount);
  const templateName = firstText(action.templateName, action.template_name);
  const threadTitle = firstText(action.threadTitle, action.thread_title);
  const targetLink = firstText(action.commentLink, action.permalink, action.url);
  const commentId = firstText(dispatch.commentId, dispatch.comment_id);
  const commentData = displayCommentData(action.commentData, action.comment_data);
  const reply = firstText(action.message, action.proposedReply, action.proposed_reply);
  const runUrl = firstText(dispatch.runUrl, dispatch.run_url);

  return compactLines([
    "*Reddit outreach comment posted*",
    action.id ? `ID: \`${escapeSlackText(action.id)}\`` : undefined,
    `Platform: ${escapeSlackText(platform)}`,
    actionName ? `Action: ${escapeSlackText(actionName)}` : undefined,
    account ? `Account: \`${escapeSlackText(account)}\`` : undefined,
    renderDispatchTargetLine(action),
    action.strategy ? `Strategy: ${escapeSlackText(action.strategy)}` : undefined,
    templateName ? `Template: ${escapeSlackText(templateName)}` : undefined,
    action.keyword ? `Keyword: ${escapeSlackText(action.keyword)}` : undefined,
    threadTitle ? `Thread: ${escapeSlackText(threadTitle)}` : undefined,
    targetLink ? `Target link: ${escapeSlackText(targetLink)}` : undefined,
    postedUrl ? `Posted comment: ${escapeSlackText(postedUrl)}` : undefined,
    commentId ? `Comment ID: \`${escapeSlackText(commentId)}\`` : undefined,
    dispatch.parent ? `Parent: \`${escapeSlackText(dispatch.parent)}\`` : undefined,
    commentData ? `Comment data:\n${escapeSlackText(commentData)}` : undefined,
    reply ? `Reply:\n${escapeSlackText(reply)}` : undefined,
    runUrl ? `Run: ${escapeSlackText(runUrl)}` : undefined
  ]);
}

function renderLeadReviewMessage(
  lead: RedditApprovalQueueItem,
  index: number,
  count: number,
  options: RedditSlackReviewMessageOptions
): RedditSlackMessage {
  const text = hasProposalDetails(lead)
    ? renderProposalReviewText(lead)
    : compactLines([
        `*${index + 1}/${count} Reddit outreach request*`,
        `ID: \`${escapeSlackText(lead.id)}\``,
        `Status: \`${lead.status}\``,
        lead.kind ? `Kind: \`${escapeSlackText(lead.kind)}\`` : undefined,
        lead.subreddit ? `Subreddit: r/${escapeSlackText(lead.subreddit)}` : undefined,
        lead.title ? `Title: ${escapeSlackText(lead.title)}` : undefined,
        lead.url ? `URL: ${escapeSlackText(lead.url)}` : undefined,
        lead.notes ? `Notes: ${escapeSlackText(lead.notes)}` : undefined,
        `Approve: click Approve, react with \`:white_check_mark:\`, or \`approve ${escapeSlackText(lead.id)}\`.`,
        `Deny: click Deny and enter a reason, or \`reject ${escapeSlackText(lead.id)} <reason>\`.`
      ]);

  return {
    id: lead.id,
    text,
    blocks: [
      markdownSection(text),
      actionsBlock([
        buttonElement({
          text: "Approve",
          actionId: REDDIT_OUTREACH_APPROVE_ACTION_ID,
          style: "primary",
          value: {
            kind: "reddit_outreach_decision",
            queueId: queueId(options),
            leadId: lead.id,
            decision: "approved"
          }
        }),
        buttonElement({
          text: "Deny",
          actionId: REDDIT_OUTREACH_REJECT_ACTION_ID,
          style: "danger",
          value: {
            kind: "reddit_outreach_decision",
            queueId: queueId(options),
            leadId: lead.id,
            decision: "rejected"
          }
        })
      ])
    ]
  };
}

function hasProposalDetails(lead: RedditApprovalQueueItem): boolean {
  return Boolean(
    lead.proposedReply ||
      displayCommentData(lead.commentData) ||
      lead.commentLink ||
      lead.strategy ||
      lead.templateName ||
      lead.keyword ||
      lead.username
  );
}

function renderProposalReviewText(lead: RedditApprovalQueueItem): string {
  const action = lead.action ?? "comment";
  const commentData = displayCommentData(lead.commentData);
  return compactLines([
    `*Outreach reply proposal ${escapeSlackText(lead.id)}*`,
    `ID: \`${escapeSlackText(lead.id)}\``,
    "Platform: reddit",
    researchRefreshLine(lead),
    lead.kind ? `Kind: \`${escapeSlackText(lead.kind)}\`` : undefined,
    `Action: ${escapeSlackText(action)}`,
    lead.subreddit ? `Subreddit: r/${escapeSlackText(lead.subreddit)}` : undefined,
    proposalTargetLine(lead),
    lead.strategy ? `Strategy: ${escapeSlackText(lead.strategy)}` : undefined,
    lead.templateName ? `Template: ${escapeSlackText(lead.templateName)}` : undefined,
    lead.keyword ? `Keyword: ${escapeSlackText(lead.keyword)}` : undefined,
    lead.threadTitle ? `Thread: ${escapeSlackText(lead.threadTitle)}` : lead.title ? `Thread: ${escapeSlackText(lead.title)}` : undefined,
    lead.commentLink ? `Comment link: ${escapeSlackText(lead.commentLink)}` : lead.url ? `Comment link: ${escapeSlackText(lead.url)}` : undefined,
    commentData ? `Comment data:\n${escapeSlackText(commentData)}` : undefined,
    researchNotesLine(lead),
    lead.whyHelpful ? `Why helpful:\n${escapeSlackText(lead.whyHelpful)}` : undefined,
    lead.safetyNotes ? `Safety notes:\n${escapeSlackText(lead.safetyNotes)}` : undefined,
    lead.proposedReply ? `Proposed reply:\n${escapeSlackText(lead.proposedReply)}` : undefined,
    `Review: approve with the button below or thread command \`approve ${escapeSlackText(
      lead.id
    )}\`. Deny by clicking Deny and entering a reason, or \`reject ${escapeSlackText(lead.id)} <reason>\`.`
  ]);
}

function researchRefreshLine(lead: RedditApprovalQueueItem): string | undefined {
  if (!lead.researchRefresh) {
    return undefined;
  }
  const refreshedAt = firstText(lead.researchRefresh.refreshedAt, lead.researchRefresh.refreshed_at);
  const date = refreshedAt ? refreshedAt.slice(0, 10) : undefined;
  const source = researchSourceLabel(firstText(lead.researchRefresh.source));
  return `Research refreshed: ${date ? `${escapeSlackText(date)} with ` : ""}${escapeSlackText(source)}.`;
}

function researchSourceLabel(source: string | undefined): string {
  return source === "codex-web-research" || !source ? "Codex web research" : source;
}

function researchNotesLine(lead: RedditApprovalQueueItem): string | undefined {
  if (!lead.researchRefresh || !lead.notes) {
    return undefined;
  }
  return `Research notes:\n${escapeSlackText(lead.notes)}`;
}

function proposalTargetLine(lead: RedditApprovalQueueItem): string | undefined {
  if (lead.username && lead.subreddit) {
    return `Target: u/${escapeSlackText(lead.username)} in r/${escapeSlackText(lead.subreddit)}`;
  }
  if (lead.username) {
    return `Target: u/${escapeSlackText(lead.username)}`;
  }
  if (lead.subreddit) {
    return `Target: r/${escapeSlackText(lead.subreddit)}`;
  }
  return undefined;
}

function renderDispatchTargetLine(action: RedditDispatchNotificationAction): string | undefined {
  if (action.username && action.subreddit) {
    return `Target: u/${escapeSlackText(action.username)} in r/${escapeSlackText(action.subreddit)}`;
  }
  if (action.username) {
    return `Target: u/${escapeSlackText(action.username)}`;
  }
  if (action.subreddit) {
    return `Target: r/${escapeSlackText(action.subreddit)}`;
  }
  return undefined;
}

function renderDispatchAccount(actual: string | undefined, scheduled: string | undefined): string | undefined {
  if (actual && scheduled && actual !== scheduled) {
    return `${actual} (scheduled ${scheduled})`;
  }
  return actual ?? scheduled;
}

function renderScheduledMessages(
  plan: Extract<RedditDailyEngagementPlan, { status: "scheduled" }>,
  options: RedditSlackReviewMessageOptions
): RedditSlackReviewMessages {
  const schedule = plan.schedule;
  return {
    parent: {
      text: compactLines([
        "*Reddit outreach schedule ready*",
        `Status: \`${plan.status}\``,
        `Approved leads: ${schedule.approvedLeadCount} of ${schedule.candidateLeadCount}`,
        `Scheduled date: \`${schedule.scheduledDate}\` (${schedule.timeZone})`,
        options.occurrenceId ? `Occurrence: \`${escapeSlackText(options.occurrenceId)}\`` : undefined,
        options.runUrl ? `Run: ${escapeSlackText(options.runUrl)}` : undefined,
        options.artifactUrl ? `Artifact: ${escapeSlackText(options.artifactUrl)}` : undefined
      ])
    },
    threadReplies: schedule.slots.map((slot, index) => ({
      id: slot.lead.id,
      text: compactLines([
        `*${index + 1}/${schedule.slots.length} Scheduled Reddit engagement*`,
        `ID: \`${escapeSlackText(slot.lead.id)}\``,
        `Scheduled for: \`${escapeSlackText(slot.scheduledLocal)}\``,
        `UTC: \`${escapeSlackText(slot.scheduledFor)}\``,
        slot.lead.account ? `Account: \`${escapeSlackText(slot.lead.account)}\`` : undefined,
        slot.lead.subreddit ? `Subreddit: r/${escapeSlackText(slot.lead.subreddit)}` : undefined,
        slot.lead.title ? `Title: ${escapeSlackText(slot.lead.title)}` : undefined,
        slot.lead.url ? `URL: ${escapeSlackText(slot.lead.url)}` : undefined
      ])
    }))
  };
}

function compactLines(lines: Array<string | undefined>): string {
  return lines.filter((line): line is string => Boolean(line)).join("\n");
}

function escapeSlackText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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

function displayCommentData(...values: Array<string | undefined>): string | undefined {
  const value = firstText(...values);
  if (!value || metadataOnlyCommentData(value)) {
    return undefined;
  }
  return value;
}

function metadataOnlyCommentData(value: string): boolean {
  const trimmed = value.trim();
  const normalized = trimmed
    .toLowerCase()
    .replace(/&[#a-z0-9]+;/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (/^source=.*\btopic=/i.test(trimmed)) {
    return true;
  }
  if (normalized === "deleted" || normalized === "removed") {
    return true;
  }
  return normalized.includes("submitted by") && normalized.includes("link") && normalized.includes("comments");
}

function queueId(options: RedditSlackReviewMessageOptions): string {
  return options.occurrenceId ?? "reddit-engagement";
}

function markdownSection(text: string): SlackBlock {
  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text: fitSlackMrkdwnSection(text)
    }
  };
}

function fitSlackMrkdwnSection(text: string): string {
  if (text.length <= SLACK_MRKDWN_SECTION_TEXT_LIMIT) {
    return text;
  }
  const marker = "\n...\n";
  const available = SLACK_MRKDWN_SECTION_TEXT_LIMIT - marker.length;
  const headLength = Math.floor(available * 0.58);
  const tailLength = available - headLength;
  return `${text.slice(0, headLength).trimEnd()}${marker}${text.slice(-tailLength).trimStart()}`;
}

function actionsBlock(elements: SlackBlock[]): SlackBlock {
  return {
    type: "actions",
    elements
  };
}

function buttonElement(input: { text: string; actionId: string; value: unknown; style?: "primary" | "danger" }): SlackBlock {
  return {
    type: "button",
    text: {
      type: "plain_text",
      text: input.text
    },
    action_id: input.actionId,
    value: JSON.stringify(input.value),
    ...(input.style ? { style: input.style } : {})
  };
}
