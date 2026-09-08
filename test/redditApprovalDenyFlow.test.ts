import { test } from "node:test";
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

function analyze(text: string) {
  const messages: SlackThreadMessageInput[] = [
    {
      ts: "1780000010.000001",
      text,
      user: "B1"
    }
  ];
  return analyzeRedditSlackApprovalThread(messages, leadIds);
}

test("deny modal reject command is parsed as a rejected decision with stripped modal suffix", () => {
  const analysis = analyze("reject lead-06 not relevant enough (modal by <@U1>)");

  assert.equal(analysis.decisions.length, 1);
  assert.equal(analysis.decisions[0]?.leadId, "lead-06");
  assert.equal(analysis.decisions[0]?.status, "rejected");
  assert.equal(analysis.decisions[0]?.reason, "not relevant enough");
});

test("deny modal retry command is parsed as retry_requested with critique reason", () => {
  const analysis = analyze("retry lead-07 needs a more specific answer (modal by <@U1>)");

  assert.equal(analysis.decisions.length, 1);
  assert.equal(analysis.decisions[0]?.leadId, "lead-07");
  assert.equal(analysis.decisions[0]?.status, "retry_requested");
  assert.equal(analysis.decisions[0]?.reason, "needs a more specific answer");
});

test("deny modal replacement command is parsed with the replacement reply preserved", () => {
  const analysis = analyze("replace lead-08 This exact reply should be used instead. (modal by <@U1>)");

  assert.equal(analysis.decisions.length, 1);
  assert.equal(analysis.decisions[0]?.leadId, "lead-08");
  assert.equal(analysis.decisions[0]?.status, "replacement_approved");
  assert.equal(analysis.decisions[0]?.replacementReply, "This exact reply should be used instead.");
});

test("retry stays pending while replacement approves the operator-supplied reply", () => {
  const analysis = analyzeRedditSlackApprovalThread([
    {
      ts: "1780000011.000001",
      text: "retry lead-07 needs source links (modal by <@U1>)",
      user: "B1"
    },
    {
      ts: "1780000012.000001",
      text: "replace lead-08 Use this replacement reply. (modal by <@U1>)",
      user: "B1"
    }
  ], leadIds);

  const applied = applyRedditApprovalDecisions(leads, analysis.decisions);

  assert.equal(analysis.decisions.length, 2);
  assert.equal(applied.approvedCount, 1);
  assert.equal(applied.rejectedCount, 0);
  assert.equal(applied.pendingCount, 11);
  assert.equal(applied.leads.find((item) => item.id === "lead-07")?.status, "pending");
  const replacementLead = applied.leads.find((item) => item.id === "lead-08");
  assert.equal(replacementLead?.status, "approved");
  assert.equal(replacementLead?.proposedReply, "Use this replacement reply.");
  assert.equal(replacementLead?.templateName, "scanner_app/comment/operator_replacement");
});

test("replacement control posts are not parsed as replacement approval commands", () => {
  const analysis = analyzeRedditSlackApprovalThread([
    {
      ts: "1780000013.000001",
      text: [
        "Replacement controls for `lead-08` - use these buttons.",
        "",
        "*Outreach reply proposal lead-08*",
        "ID: `lead-08`",
        "Review: approve with the button below or thread command `approve lead-08`.",
        "Deny by clicking Deny and entering a reason, or `reject lead-08 <reason>`."
      ].join("\n"),
      user: "B1"
    }
  ], leadIds);

  assert.deepEqual(analysis.decisions, []);
});

test("replacement command only targets lead ids immediately after the command", () => {
  const analysis = analyzeRedditSlackApprovalThread([
    {
      ts: "1780000014.000001",
      text: "replace lead-08 Use this reply and leave lead-09 alone (modal by <@U1>)",
      user: "B1"
    }
  ], leadIds);

  assert.equal(analysis.decisions.length, 1);
  assert.equal(analysis.decisions[0]?.leadId, "lead-08");
  assert.equal(analysis.decisions[0]?.status, "replacement_approved");
  assert.equal(analysis.decisions[0]?.replacementReply, "Use this reply and leave lead-09 alone");
});
