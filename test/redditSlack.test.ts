import assert from "node:assert/strict";

import { renderRedditDispatchNotification, renderRedditSlackReviewMessages } from "../src/slack.js";
import type { RedditDailyEngagementPlan } from "../src/daily.js";
import { REDDIT_ENGAGEMENT_WINDOWS } from "../src/scheduling.js";

const leads = [
  {
    id: "lead-01",
    status: "pending_approval" as const,
    subreddit: "SaaS",
    url: "https://www.reddit.com/r/SaaS/comments/1",
    title: "Need feedback"
  },
  {
    id: "lead-02",
    status: "pending_approval" as const,
    subreddit: "SideProject",
    url: "https://www.reddit.com/r/SideProject/comments/2"
  }
];

const proposalLeads = [
  {
    id: "slack-original-naturalbeauty-apps-003",
    status: "pending_approval" as const,
    subreddit: "NaturalBeauty",
    action: "comment",
    username: "zeeskaya",
    strategy: "controversial_ingredient",
    templateName: "controversial_ingredient/comment/general_recommendation",
    keyword: "ingredient checker app",
    threadTitle: "half these natural brands are just lying and im over it",
    commentLink: "https://www.reddit.com/r/NaturalBeauty/comments/1slq186/comment/oga3scd/",
    commentData: "Can you recommend any apps?",
    proposedReply:
      "Have you tried scanning the actual ingredients list instead of the barcode? I use the pom app for this and the thing that sets it apart is you customize how ingredients get flagged based on the severity of the research."
  }
];

const plan: RedditDailyEngagementPlan = {
  platform: "reddit",
  status: "awaiting_approval",
  approvalQueue: {
    platform: "reddit",
    status: "awaiting_approval",
    timeZone: "America/New_York",
    requiredLeadCount: { min: 12, max: 20 },
    candidateLeadCount: leads.length,
    leads,
    generatedAt: "2026-06-03T12:00:00.000Z",
    schedulingRule: {
      target: "next_day_after_approval",
      windows: REDDIT_ENGAGEMENT_WINDOWS
    }
  }
};

const proposalPlan: RedditDailyEngagementPlan = {
  platform: "reddit",
  status: "awaiting_approval",
  approvalQueue: {
    platform: "reddit",
    status: "awaiting_approval",
    timeZone: "America/New_York",
    requiredLeadCount: { min: 12, max: 20 },
    candidateLeadCount: proposalLeads.length,
    leads: proposalLeads,
    generatedAt: "2026-06-03T12:00:00.000Z",
    schedulingRule: {
      target: "next_day_after_approval",
      windows: REDDIT_ENGAGEMENT_WINDOWS
    }
  }
};

{
  const messages = renderRedditSlackReviewMessages(plan, { occurrenceId: "queue-1" });
  const parentActions = actionElements(messages.parent.blocks);
  const leadActions = actionElements(messages.threadReplies[0]?.blocks);

  assert.equal(messages.threadReplies.length, 2);
  assert.deepEqual(
    parentActions.map((action) => action.action_id),
    ["ii_outreach_reddit_approve_all"]
  );
  assert.deepEqual(
    leadActions.map((action) => action.action_id),
    ["ii_outreach_reddit_approve", "ii_outreach_reddit_reject"]
  );
  assert.deepEqual(parseActionValue(parentActions[0]), {
    kind: "reddit_outreach_bulk_decision",
    queueId: "queue-1",
    decision: "approved"
  });
  assert.deepEqual(parseActionValue(leadActions[0]), {
    kind: "reddit_outreach_decision",
    queueId: "queue-1",
    leadId: "lead-01",
    decision: "approved"
  });
  assert.deepEqual(parseActionValue(leadActions[1]), {
    kind: "reddit_outreach_decision",
    queueId: "queue-1",
    leadId: "lead-01",
    decision: "rejected"
  });
  assert.match(messages.parent.text, /:white_check_mark:/);
  assert.match(messages.parent.text, /approve all/);
  assert.doesNotMatch(messages.parent.text, /schedule approved/i);

  const leadText = messages.threadReplies[0]?.text ?? "";
  assert.match(leadText, /approve lead-01/);
  assert.match(leadText, /reject lead-01 <reason>/);
  assert.match(leadText, /:white_check_mark:/);
}

{
  const messages = renderRedditSlackReviewMessages(proposalPlan, { occurrenceId: "proposal-queue" });
  const text = messages.threadReplies[0]?.text ?? "";
  const leadActions = actionElements(messages.threadReplies[0]?.blocks);

  assert.match(text, /Outreach reply proposal slack-original-naturalbeauty-apps-003/);
  assert.match(text, /Platform: reddit/);
  assert.match(text, /Action: comment/);
  assert.match(text, /Target: u\/zeeskaya in r\/NaturalBeauty/);
  assert.match(text, /Strategy: controversial_ingredient/);
  assert.match(text, /Template: controversial_ingredient\/comment\/general_recommendation/);
  assert.match(text, /Keyword: ingredient checker app/);
  assert.match(text, /Thread: half these natural brands are just lying and im over it/);
  assert.match(text, /Comment link: https:\/\/www\.reddit\.com\/r\/NaturalBeauty\/comments\/1slq186\/comment\/oga3scd\//);
  assert.match(text, /Comment data:\nCan you recommend any apps\?/);
  assert.match(text, /Proposed reply:\nHave you tried scanning the actual ingredients list/);
  assert.deepEqual(
    leadActions.map((action) => action.action_id),
    ["ii_outreach_reddit_approve", "ii_outreach_reddit_reject"]
  );
  assert.deepEqual(parseActionValue(leadActions[0]), {
    kind: "reddit_outreach_decision",
    queueId: "proposal-queue",
    leadId: "slack-original-naturalbeauty-apps-003",
    decision: "approved"
  });
  assert.deepEqual(parseActionValue(leadActions[1]), {
    kind: "reddit_outreach_decision",
    queueId: "proposal-queue",
    leadId: "slack-original-naturalbeauty-apps-003",
    decision: "rejected"
  });
}

{
  const researchedPlan: RedditDailyEngagementPlan = {
    ...proposalPlan,
    approvalQueue: {
      ...proposalPlan.approvalQueue,
      leads: [
        {
          ...proposalLeads[0],
          notes: "Checked target thread and supporting web context before drafting.",
          whyHelpful: "Answers the user's exact product-comparison question.",
          safetyNotes: "No medical advice.",
          researchRefresh: {
            refreshedAt: "2026-07-02T01:16:03.000Z",
            source: "codex-web-research"
          }
        }
      ]
    }
  };
  const messages = renderRedditSlackReviewMessages(researchedPlan, { occurrenceId: "proposal-queue" });
  const text = messages.threadReplies[0]?.text ?? "";

  assert.match(text, /Research refreshed: 2026-07-02 with Codex web research\./);
  assert.match(text, /Research notes:\nChecked target thread and supporting web context before drafting\./);
  assert.match(text, /Why helpful:\nAnswers the user's exact product-comparison question\./);
  assert.match(text, /Safety notes:\nNo medical advice\./);
}

{
  const longComment = "sensitive skin context ".repeat(140);
  const longPlan: RedditDailyEngagementPlan = {
    ...proposalPlan,
    approvalQueue: {
      ...proposalPlan.approvalQueue,
      leads: [
        {
          ...proposalLeads[0],
          commentData: longComment,
          proposedReply: "A short researched reply that should stay visible.",
          researchRefresh: {
            refreshedAt: "2026-07-02T01:16:03.000Z",
            source: "codex-web-research"
          }
        }
      ]
    }
  };
  const messages = renderRedditSlackReviewMessages(longPlan, { occurrenceId: "proposal-queue" });
  const text = messages.threadReplies[0]?.text ?? "";
  const blockText = sectionText(messages.threadReplies[0]?.blocks);

  assert.ok(text.length > 3000);
  assert.ok(blockText.length <= 3000);
  assert.match(blockText, /Research refreshed: 2026-07-02 with Codex web research\./);
  assert.match(blockText, /Proposed reply:\nA short researched reply that should stay visible\./);
}

{
  const metadataOnlyPlan: RedditDailyEngagementPlan = {
    ...proposalPlan,
    approvalQueue: {
      ...proposalPlan.approvalQueue,
      candidateLeadCount: 1,
      leads: [
        {
          ...proposalLeads[0],
          id: "metadata-comment-data",
          commentData: "source=search topic=ingredient-list"
        }
      ]
    }
  };
  const messages = renderRedditSlackReviewMessages(metadataOnlyPlan, { occurrenceId: "proposal-queue" });
  const text = messages.threadReplies[0]?.text ?? "";

  assert.match(text, /Outreach reply proposal metadata-comment-data/);
  assert.doesNotMatch(text, /Comment data:/);
  assert.doesNotMatch(text, /source=search/);
  assert.match(text, /Proposed reply:/);
}

{
  const text = renderRedditDispatchNotification({
    id: "slack-original-naturalbeauty-apps-003",
    platform: "reddit",
    action: "comment",
    account: "working_golf",
    username: "zeeskaya",
    subreddit: "NaturalBeauty",
    strategy: "controversial_ingredient",
    templateName: "controversial_ingredient/comment/general_recommendation",
    keyword: "ingredient checker app",
    threadTitle: "half these natural brands are just lying and im over it",
    commentLink: "https://www.reddit.com/r/NaturalBeauty/comments/1slq186/comment/oga3scd/",
    commentData: "Can you recommend any apps?",
    message:
      "Have you tried scanning the actual ingredients list instead of the barcode? I use the pom app for this.",
    dispatch_result: {
      account: "this_photo",
      posted_url: "https://www.reddit.com/r/NaturalBeauty/comments/1slq186/comment/ogbposted/",
      comment_id: "ogbposted",
      parent: "oga3scd",
      run_url: "https://github.com/example-org/example-app/actions/runs/123"
    }
  });

  assert.match(text, /Reddit outreach comment posted/);
  assert.match(text, /ID: `slack-original-naturalbeauty-apps-003`/);
  assert.match(text, /Platform: reddit/);
  assert.match(text, /Action: comment/);
  assert.match(text, /Account: `this_photo \(scheduled working_golf\)`/);
  assert.match(text, /Target: u\/zeeskaya in r\/NaturalBeauty/);
  assert.match(text, /Strategy: controversial_ingredient/);
  assert.match(text, /Template: controversial_ingredient\/comment\/general_recommendation/);
  assert.match(text, /Keyword: ingredient checker app/);
  assert.match(text, /Thread: half these natural brands are just lying and im over it/);
  assert.match(text, /Target link: https:\/\/www\.reddit\.com\/r\/NaturalBeauty\/comments\/1slq186\/comment\/oga3scd\//);
  assert.match(text, /Posted comment: https:\/\/www\.reddit\.com\/r\/NaturalBeauty\/comments\/1slq186\/comment\/ogbposted\//);
  assert.match(text, /Comment ID: `ogbposted`/);
  assert.match(text, /Parent: `oga3scd`/);
  assert.match(text, /Comment data:\nCan you recommend any apps\?/);
  assert.match(text, /Reply:\nHave you tried scanning the actual ingredients list/);
  assert.match(text, /Run: https:\/\/github\.com\/example-org\/example-app\/actions\/runs\/123/);
}

{
  const text = renderRedditDispatchNotification({
    id: "metadata-comment-data",
    platform: "reddit",
    action: "comment",
    account: "working_golf",
    username: "zeeskaya",
    subreddit: "NaturalBeauty",
    commentData: "source=search topic=ingredient-list",
    message: "Have you tried scanning the actual ingredients list instead?"
  });

  assert.doesNotMatch(text, /Comment data:/);
  assert.doesNotMatch(text, /source=search/);
  assert.match(text, /Reply:\nHave you tried scanning the actual ingredients list/);
}

function actionElements(blocks: Array<Record<string, unknown>> | undefined): Array<Record<string, string>> {
  const actionsBlock = blocks?.find((block) => block.type === "actions") as { elements?: Array<Record<string, string>> } | undefined;
  return actionsBlock?.elements ?? [];
}

function sectionText(blocks: Array<Record<string, unknown>> | undefined): string {
  const section = blocks?.find((block) => block.type === "section") as { text?: { text?: string } } | undefined;
  return section?.text?.text ?? "";
}

function parseActionValue(action: Record<string, string> | undefined): unknown {
  assert.ok(action?.value);
  return JSON.parse(action.value);
}
