import assert from "node:assert/strict";

import {
  appendRedditPostedLedgerRecord,
  filterRedditLeadsNotPosted,
  readRedditPostedLedger,
  redditPostedTargetKey
} from "../src/redditPostedLedger.js";
import { createRedditDailyEngagementPlan } from "../src/daily.js";
import type { RedditLead } from "../src/scheduling.js";

const target = "https://www.reddit.com/r/AsianBeauty/comments/1spmbxp/anyone_actually_look_at_the_ingredient_list_of/";
const posted = "https://www.reddit.com/r/AsianBeauty/comments/1spmbxp/comment/abc123/";

{
  const markdown = appendRedditPostedLedgerRecord("", {
    leadId: "reddit-asianbeauty-1spmbxp",
    targetUrl: target,
    postedUrl: posted,
    commentId: "abc123",
    account: "working_golf",
    subreddit: "AsianBeauty",
    templateName: "scanner_app/comment/general_recommendation",
    keyword: "ingredient list",
    queueId: "queue-1",
    postedAt: "2026-06-07T01:00:00.000Z",
    message:
      "If you care about what is in your products, the pom app is worth a look. You scan the ingredient list and set your own thresholds.",
    commentData:
      "OP asks whether people look at ingredient lists for base products and which ingredients matter.",
    threadTitle: "Anyone actually look at the ingredient list of their base products?",
    lead: {
      id: "reddit-asianbeauty-1spmbxp",
      platform: "reddit",
      status: "approved",
      subreddit: "AsianBeauty",
      commentLink: target,
      commentData:
        "OP asks whether people look at ingredient lists for base products and which ingredients matter.",
      proposedReply:
        "If you care about what is in your products, the pom app is worth a look. You scan the ingredient list and set your own thresholds."
    },
    dispatchResult: {
      posted_url: posted,
      comment_id: "abc123"
    }
  });
  assert.match(markdown, /# Posted Reddit Outreach/);
  assert.match(markdown, /reddit-posted-ledger-entry/);
  assert.match(markdown, /reddit-asianbeauty-1spmbxp/);
  assert.match(markdown, /### Comment Data/);
  assert.match(markdown, /### Posted Reply/);
  assert.match(markdown, /### Full Context/);
  assert.match(markdown, /OP asks whether people look at ingredient lists/);
  assert.match(markdown, /"leadId": "reddit-asianbeauty-1spmbxp"/);

  const records = readRedditPostedLedger(markdown);
  assert.equal(records.length, 1);
  assert.equal(records[0]?.leadId, "reddit-asianbeauty-1spmbxp");
  assert.equal(records[0]?.targetKey, "reddit:post:1spmbxp");

  const duplicateAppend = appendRedditPostedLedgerRecord(markdown, {
    leadId: "reddit-asianbeauty-1spmbxp",
    targetUrl: target,
    postedUrl: posted,
    postedAt: "2026-06-07T01:05:00.000Z"
  });
  assert.equal(readRedditPostedLedger(duplicateAppend).length, 1);
}

{
  assert.equal(redditPostedTargetKey(`${target}?utm_source=reddit#x`), "reddit:post:1spmbxp");
  assert.equal(redditPostedTargetKey(posted), "reddit:comment:1spmbxp:abc123");
}

{
  const records = readRedditPostedLedger(appendRedditPostedLedgerRecord("", {
    leadId: "posted-lead",
    targetUrl: target,
    postedAt: "2026-06-07T01:00:00.000Z"
  }));
  const leads: RedditLead[] = [
    {
      id: "posted-lead",
      platform: "reddit",
      status: "pending",
      commentLink: target
    },
    {
      id: "same-target",
      platform: "reddit",
      status: "pending",
      commentLink: `${target}?context=3`
    },
    {
      id: "new-lead",
      platform: "reddit",
      status: "pending",
      commentLink: "https://www.reddit.com/r/AsianBeauty/comments/new123/another_thread/"
    }
  ];
  assert.deepEqual(filterRedditLeadsNotPosted(leads, records).map((lead) => lead.id), ["new-lead"]);
}

{
  const markdown = appendRedditPostedLedgerRecord("", {
    leadId: "posted-lead",
    targetUrl: target,
    postedAt: "2026-06-07T01:00:00.000Z"
  });
  const leads: RedditLead[] = [
    {
      id: "posted-lead",
      platform: "reddit",
      status: "pending",
      commentLink: target
    },
    ...Array.from({ length: 12 }, (_, index) => ({
      id: `new-lead-${index + 1}`,
      platform: "reddit" as const,
      status: "pending" as const,
      commentLink: `https://www.reddit.com/r/AsianBeauty/comments/new${index + 1}/another_thread/`
    }))
  ];
  const plan = createRedditDailyEngagementPlan({
    leads,
    postedLedgerMarkdown: markdown,
    generatedAt: "2026-06-07T01:00:00.000Z"
  });
  assert.equal(plan.approvalQueue.candidateLeadCount, 12);
  assert.equal(plan.approvalQueue.leads.some((lead) => lead.id === "posted-lead"), false);
}
