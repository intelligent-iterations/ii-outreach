import type { RedditApprovalQueue, RedditApprovalQueueItem, RedditDailyEngagementPlan } from "./daily.js";
import type { RedditEngagementSchedule, ScheduledRedditEngagement } from "./scheduling.js";
import {
  renderRedditSlackReviewMessages,
  type RedditSlackMessage,
  type RedditSlackReviewMessageOptions,
  type RedditSlackReviewMessages,
  type SlackBlock
} from "./slack.js";

export interface RedditSubredditSlackReviewMessages extends RedditSlackReviewMessages {
  subreddit: string;
}

/** @deprecated Outreach review belongs to the host application. Retained for historical migration only. */
export function renderRedditSlackReviewMessagesBySubreddit(
  plan: RedditDailyEngagementPlan,
  options: RedditSlackReviewMessageOptions = {}
): RedditSubredditSlackReviewMessages[] {
  if (plan.status === "scheduled") {
    return renderScheduledBySubreddit(plan, options);
  }

  return [...groupApprovalItemsBySubreddit(plan.approvalQueue.leads).entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([subreddit, leads]) => {
      const groupedPlan: RedditDailyEngagementPlan = {
        platform: "reddit",
        status: "awaiting_approval",
        approvalQueue: {
          ...plan.approvalQueue,
          candidateLeadCount: leads.length,
          requiredLeadCount: {
            min: leads.length,
            max: leads.length
          },
          leads
        }
      };
      return withSubredditPrefix(
        subreddit,
        renderRedditSlackReviewMessages(groupedPlan, subredditOptions(options, subreddit))
      );
    });
}

function renderScheduledBySubreddit(
  plan: Extract<RedditDailyEngagementPlan, { status: "scheduled" }>,
  options: RedditSlackReviewMessageOptions
): RedditSubredditSlackReviewMessages[] {
  const queueGroups = groupApprovalItemsBySubreddit(plan.approvalQueue.leads);
  return [...groupSlotsBySubreddit(plan.schedule.slots).entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([subreddit, slots]) => {
      const schedule: RedditEngagementSchedule = {
        ...plan.schedule,
        approvedLeadCount: slots.length,
        slots
      };
      const approvalQueue: RedditApprovalQueue = {
        ...plan.approvalQueue,
        candidateLeadCount: queueGroups.get(subreddit)?.length ?? slots.length,
        leads: queueGroups.get(subreddit) ?? slots.map((slot) => slot.lead as RedditApprovalQueueItem)
      };
      return withSubredditPrefix(
        subreddit,
        renderRedditSlackReviewMessages(
          {
            platform: "reddit",
            status: "scheduled",
            approvalQueue,
            schedule
          },
          subredditOptions(options, subreddit)
        )
      );
    });
}

function withSubredditPrefix(
  subreddit: string,
  messages: RedditSlackReviewMessages
): RedditSubredditSlackReviewMessages {
  const prefix = `*r/${escapeSlackText(subreddit)} Reddit outreach*`;
  return {
    subreddit,
    parent: prefixMessage(messages.parent, prefix),
    threadReplies: messages.threadReplies
  };
}

function prefixMessage(message: RedditSlackMessage, prefix: string): RedditSlackMessage {
  const text = `${prefix}\n${message.text}`;
  return {
    ...message,
    text,
    blocks: message.blocks?.map((block, index) => (index === 0 ? prefixSectionBlock(block, text) : block))
  };
}

function prefixSectionBlock(block: SlackBlock, text: string): SlackBlock {
  if (block.type !== "section") {
    return block;
  }
  const sectionText = block.text;
  if (!sectionText || typeof sectionText !== "object" || !("text" in sectionText)) {
    return block;
  }
  return {
    ...block,
    text: {
      ...sectionText,
      text
    }
  };
}

function groupApprovalItemsBySubreddit(items: RedditApprovalQueueItem[]): Map<string, RedditApprovalQueueItem[]> {
  const out = new Map<string, RedditApprovalQueueItem[]>();
  for (const item of items) {
    const subreddit = normalizeSubreddit(item.subreddit);
    const group = out.get(subreddit) ?? [];
    group.push(item);
    out.set(subreddit, group);
  }
  return out;
}

function groupSlotsBySubreddit(slots: ScheduledRedditEngagement[]): Map<string, ScheduledRedditEngagement[]> {
  const out = new Map<string, ScheduledRedditEngagement[]>();
  for (const slot of slots) {
    const subreddit = normalizeSubreddit(slot.lead.subreddit);
    const group = out.get(subreddit) ?? [];
    group.push(slot);
    out.set(subreddit, group);
  }
  return out;
}

function subredditOptions(
  options: RedditSlackReviewMessageOptions,
  subreddit: string
): RedditSlackReviewMessageOptions {
  return {
    ...options,
    occurrenceId: `${options.occurrenceId ?? "reddit-engagement"}:subreddit:${subredditSlug(subreddit)}`
  };
}

function normalizeSubreddit(value: string | undefined): string {
  const trimmed = value?.trim().replace(/^r\//i, "");
  return trimmed || "unknown";
}

function subredditSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_.-]+/g, "-");
}

function escapeSlackText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
