import assert from "node:assert/strict";

import {
  analyzeRedditSlackApprovalThread,
  applyRedditApprovalDecisions,
  type SlackThreadMessageInput
} from "../src/approval.js";
import type { RedditLead } from "../src/scheduling.js";

function lead(index: number): RedditLead {
  return {
    id: `lead-${String(index).padStart(2, "0")}`,
    platform: "reddit",
    status: "pending",
    subreddit: "SaaS",
    url: `https://www.reddit.com/r/SaaS/comments/${index}`
  };
}

const leads = Array.from({ length: 12 }, (_, index) => lead(index + 1));
const leadIds = leads.map((item) => item.id);

{
  const messages: SlackThreadMessageInput[] = [
    {
      ts: "1780000000.000001",
      text: "*1/12 Reddit outreach request*\nID: `lead-01`",
      bot_id: "B1",
      reactions: [{ name: "white_check_mark", users: ["U1"] }]
    },
    {
      ts: "1780000001.000001",
      text: "approve lead-02 lead-03",
      user: "U2"
    },
    {
      ts: "1780000002.000001",
      text: "reject lead-03 wrong campaign fit",
      user: "U2"
    }
  ];

  const analysis = analyzeRedditSlackApprovalThread(messages, leadIds);
  const applied = applyRedditApprovalDecisions(leads, analysis.decisions);

  assert.equal(analysis.decisions.length, 4);
  assert.equal(applied.leads.find((item) => item.id === "lead-01")?.status, "approved");
  assert.equal(applied.leads.find((item) => item.id === "lead-02")?.status, "approved");
  assert.equal(applied.leads.find((item) => item.id === "lead-03")?.status, "rejected");
  assert.equal(applied.leads.find((item) => item.id === "lead-03")?.denialReason, "wrong campaign fit");
  assert.equal(applied.approvedCount, 2);
  assert.equal(applied.rejectedCount, 1);
  assert.equal(applied.pendingCount, 9);
}

{
  const analysis = analyzeRedditSlackApprovalThread([
    {
      ts: "1780000003.000001",
      text: "approve all",
      user: "U1"
    }
  ], leadIds);
  const applied = applyRedditApprovalDecisions(leads, analysis.decisions);

  assert.equal(analysis.decisions.length, 12);
  assert.equal(applied.approvedCount, 12);
  assert.equal(applied.pendingCount, 0);
}

{
  const messages: SlackThreadMessageInput[] = [
    { ts: "1780000001.000001", text: "approve lead-04", user: "U1" },
    { ts: "1780000002.000001", text: "schedule approved", user: "U1" }
  ];
  const analysis = analyzeRedditSlackApprovalThread(messages, leadIds);

  assert.deepEqual(analysis.decisions.map((decision) => decision.leadId), ["lead-04"]);
}

{
  const messages: SlackThreadMessageInput[] = [
    { ts: "1780000001.000001", text: "reject lead-05", user: "U1" },
    {
      ts: "1780000002.000001",
      text: "*5/12 Reddit outreach request*\nID: `lead-05`",
      bot_id: "B1",
      reactions: [{ name: "x", users: ["U1"] }]
    }
  ];
  const analysis = analyzeRedditSlackApprovalThread(messages, leadIds);

  assert.deepEqual(analysis.decisions, []);
}

{
  const analysis = analyzeRedditSlackApprovalThread([
    {
      ts: "1780000004.000001",
      text: "reject lead-06 not relevant enough (modal by <@U1>)",
      user: "B1"
    }
  ], leadIds);
  const applied = applyRedditApprovalDecisions(leads, analysis.decisions);

  assert.equal(applied.leads.find((item) => item.id === "lead-06")?.status, "rejected");
  assert.equal(applied.leads.find((item) => item.id === "lead-06")?.denialReason, "not relevant enough");
}

{
  const analysis = analyzeRedditSlackApprovalThread([
    {
      ts: "1780000005.000001",
      text: "retry lead-07 needs a more specific answer (modal by <@U1>)",
      user: "B1"
    }
  ], leadIds);

  assert.equal(analysis.decisions.length, 1);
  assert.equal(analysis.decisions[0]?.leadId, "lead-07");
  assert.equal(analysis.decisions[0]?.status, "retry_requested");
  assert.equal(analysis.decisions[0]?.reason, "needs a more specific answer");
}

{
  const analysis = analyzeRedditSlackApprovalThread([
    {
      ts: "1780000006.000001",
      text: "replace lead-08 This exact reply should be used instead. (modal by <@U1>)",
      user: "B1"
    }
  ], leadIds);

  assert.equal(analysis.decisions.length, 1);
  assert.equal(analysis.decisions[0]?.leadId, "lead-08");
  assert.equal(analysis.decisions[0]?.status, "replacement_approved");
  assert.equal(analysis.decisions[0]?.replacementReply, "This exact reply should be used instead.");
}

{
  const original: RedditLead = {
    ...lead(9),
    message: "Original suggested reply.",
    proposedReply: "Original suggested reply.",
    templateName: "aurafarm/general"
  };
  const applied = applyRedditApprovalDecisions([original], [{
    leadId: original.id,
    status: "approved",
    source: "host_application",
    reviewer: "reviewer@example.com",
    approvedReply: "This is the exact human-edited reply."
  }]);

  assert.equal(applied.approvedCount, 1);
  assert.equal(applied.leads[0]?.message, "This is the exact human-edited reply.");
  assert.equal(applied.leads[0]?.proposedReply, "This is the exact human-edited reply.");
  assert.equal(applied.leads[0]?.templateName, "human_edited_approved");
}
