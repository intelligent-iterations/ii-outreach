import assert from "node:assert/strict";

import {
  appendRedditReviewHistoryRecord,
  readRedditReviewHistory,
  redditReviewHistoryKey
} from "../src/redditReviewHistory.js";
import type { RedditReviewHistoryRecord } from "../src/redditReviewHistory.js";

const baseRecord: RedditReviewHistoryRecord = {
  queueId: "queue-1",
  leadId: "reddit-asianbeauty-1spmbxp",
  status: "approved",
  recordedAt: "2026-06-07T01:05:00.000Z",
  decidedAt: "2026-06-07T01:00:00.000Z",
  reviewer: "U123",
  source: "slack_text",
  slackChannel: "C123",
  slackThreadTs: "1780803600.000000",
  lead: {
    id: "reddit-asianbeauty-1spmbxp",
    platform: "reddit",
    status: "approved",
    approved: true,
    subreddit: "AsianBeauty",
    templateName: "scanner_app/comment/general_recommendation",
    keyword: "ingredient list",
    threadTitle: "Anyone actually look at the ingredient list of their base products?",
    commentLink: "https://www.reddit.com/r/AsianBeauty/comments/1spmbxp/ingredient_list/",
    commentData:
      "OP asks whether people look at ingredient lists for base products and which ingredients matter.",
    proposedReply:
      "If you care about what is in your products, the pom app is worth a look. You scan the ingredient list and set your own thresholds."
  },
  decision: {
    leadId: "reddit-asianbeauty-1spmbxp",
    status: "approved",
    source: "slack_text",
    reviewer: "U123",
    decidedAt: "1780803600.000000"
  }
};

{
  const markdown = appendRedditReviewHistoryRecord("", baseRecord);
  assert.match(markdown, /# Reddit Review History/);
  assert.match(markdown, /reddit-review-history-entry/);
  assert.match(markdown, /### Comment Data/);
  assert.match(markdown, /### Proposed Reply/);
  assert.match(markdown, /### Full Context/);
  assert.match(markdown, /OP asks whether people look at ingredient lists/);
  assert.match(markdown, /"leadId": "reddit-asianbeauty-1spmbxp"/);

  const records = readRedditReviewHistory(markdown);
  assert.equal(records.length, 1);
  assert.equal(records[0]?.key, redditReviewHistoryKey(baseRecord));

  const duplicateAppend = appendRedditReviewHistoryRecord(markdown, {
    ...baseRecord,
    recordedAt: "2026-06-07T01:10:00.000Z"
  });
  assert.equal(readRedditReviewHistory(duplicateAppend).length, 1);
}

{
  const rejected = {
    ...baseRecord,
    status: "rejected" as const,
    decidedAt: undefined,
    reason: "Too promotional for this thread.",
    lead: {
      ...baseRecord.lead!,
      status: "rejected" as const,
      denialReason: "Too promotional for this thread."
    }
  };
  const retry = {
    ...rejected,
    recordedAt: "2026-06-07T01:20:00.000Z"
  };
  assert.equal(redditReviewHistoryKey(rejected), redditReviewHistoryKey(retry));

  const markdown = appendRedditReviewHistoryRecord("", rejected);
  const duplicateAppend = appendRedditReviewHistoryRecord(markdown, retry);
  assert.equal(readRedditReviewHistory(duplicateAppend).length, 1);
  assert.match(duplicateAppend, /Denial reason: Too promotional for this thread\./);
}

{
  const retryRequested: RedditReviewHistoryRecord = {
    ...baseRecord,
    status: "retry_requested",
    decidedAt: "2026-06-07T01:30:00.000Z",
    reason: "Too generic; redraft around the actual ingredient list question.",
    lead: {
      ...baseRecord.lead!,
      status: "pending",
      retryReason: "Too generic; redraft around the actual ingredient list question."
    },
    decision: {
      leadId: "reddit-asianbeauty-1spmbxp",
      status: "retry_requested",
      source: "slack_text",
      reason: "Too generic; redraft around the actual ingredient list question."
    }
  };
  const markdown = appendRedditReviewHistoryRecord("", retryRequested);

  assert.match(markdown, /retry_requested/);
  assert.match(markdown, /Retry critique: Too generic; redraft around the actual ingredient list question\./);
  assert.match(markdown, /### Proposed Reply/);
  assert.match(markdown, /### Full Context/);
  assert.equal(readRedditReviewHistory(markdown)[0]?.status, "retry_requested");
  assert.notEqual(redditReviewHistoryKey(retryRequested), redditReviewHistoryKey({
    ...retryRequested,
    reason: "Different critique should be a distinct iteration."
  }));
}

{
  const replacementApproved: RedditReviewHistoryRecord = {
    ...baseRecord,
    status: "replacement_approved",
    decidedAt: "2026-06-07T01:35:00.000Z",
    reason: "Some ingredient listings can be deceptive, especially for people with allergies.",
    lead: {
      ...baseRecord.lead!,
      status: "approved",
      templateName: "scanner_app/comment/operator_replacement",
      proposedReply: "Some ingredient listings can be deceptive, especially for people with allergies."
    },
    decision: {
      leadId: "reddit-asianbeauty-1spmbxp",
      status: "replacement_approved",
      source: "slack_text",
      replacementReply: "Some ingredient listings can be deceptive, especially for people with allergies."
    }
  };
  const markdown = appendRedditReviewHistoryRecord("", replacementApproved);

  assert.match(markdown, /replacement_approved/);
  assert.match(markdown, /Replacement reply: Some ingredient listings can be deceptive/);
  assert.equal(readRedditReviewHistory(markdown)[0]?.status, "replacement_approved");
}
