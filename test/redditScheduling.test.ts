import assert from "node:assert/strict";

import { createRedditDailyEngagementPlan } from "../src/daily.js";
import { approveRedditLead, denyRedditLead } from "../src/review.js";
import {
  createRedditEngagementSchedule,
  type RedditLead,
  validateRedditLeadBatch
} from "../src/scheduling.js";
import { renderRedditSlackReviewMessages } from "../src/slack.js";

function makeLead(index: number, status: RedditLead["status"] = "approved"): RedditLead {
  return {
    id: `lead-${String(index).padStart(2, "0")}`,
    platform: "reddit",
    status,
    subreddit: "SaaS",
    title: `Lead ${index} <scan> & review`,
    url: `https://www.reddit.com/r/SaaS/comments/${index}`
  };
}

function makeProposalLead(index: number, status: RedditLead["status"] = "pending"): RedditLead {
  return {
    ...makeLead(index, status),
    id: `slack-original-naturalbeauty-apps-${String(index).padStart(3, "0")}`,
    action_type: "comment",
    username: "zeeskaya",
    strategy: "controversial_ingredient",
    template_name: "controversial_ingredient/comment/general_recommendation",
    keyword: "ingredient checker app",
    thread_title: "half these natural brands are just lying and im over it",
    permalink: "https://www.reddit.com/r/NaturalBeauty/comments/1slq186/comment/oga3scd/",
    target_text: "Can you recommend any apps?",
    message:
      "Have you tried scanning the actual ingredients list instead of the barcode? I use the pom app for this and the thing that sets it apart is you customize how ingredients get flagged based on the severity of the research."
  };
}

function localHour(iso: string, timeZone = "America/New_York"): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date(iso)).find((part) => part.type === "hour")?.value;
  assert.ok(hour);
  return Number(hour);
}

const mixedApprovalBatch = [
  ...Array.from({ length: 12 }, (_, index) => makeLead(index + 1, "approved")),
  makeLead(13, "pending"),
  makeLead(14, "rejected"),
  makeLead(15, "pending")
];

{
  const schedule = createRedditEngagementSchedule({
    leads: mixedApprovalBatch,
    approvedAt: "2026-06-01T18:00:00.000Z",
    generatedAt: "2026-06-01T18:00:01.000Z",
    seed: "stable-test"
  });

  assert.equal(schedule.platform, "reddit");
  assert.equal(schedule.timeZone, "America/New_York");
  assert.equal(schedule.scheduledDate, "2026-06-02");
  assert.equal(schedule.candidateLeadCount, 15);
  assert.equal(schedule.approvedLeadCount, 12);
  assert.equal(schedule.slots.length, 12);
  assert.equal(schedule.slots.every((slot) => slot.lead.status === "approved"), true);
  assert.equal(schedule.slots.some((slot) => slot.window === "early"), true);
  assert.equal(schedule.slots.some((slot) => slot.window === "mid_morning_break"), true);

  const scheduledTimes = schedule.slots.map((slot) => slot.scheduledFor);
  assert.deepEqual([...scheduledTimes].sort(), scheduledTimes);
  assert.equal(new Set(scheduledTimes).size, scheduledTimes.length);
  for (const slot of schedule.slots) {
    const hour = localHour(slot.scheduledFor);
    assert.equal(slot.scheduledLocal.startsWith("2026-06-02 "), true);
    assert.ok(hour >= 6 && hour < 11, `${slot.scheduledFor} should be inside the Eastern window`);
  }
}

{
  const plan = createRedditDailyEngagementPlan({
    leads: Array.from({ length: 12 }, (_, index) => makeLead(index + 1, "pending")),
    generatedAt: "2026-06-01T18:00:00.000Z"
  });
  assert.equal(plan.status, "awaiting_approval");
  assert.equal(plan.approvalQueue.candidateLeadCount, 12);
  assert.equal(plan.approvalQueue.requiredLeadCount.min, 12);
  assert.equal(plan.approvalQueue.requiredLeadCount.max, 20);
  assert.equal(plan.approvalQueue.schedulingRule.target, "next_day_after_approval");
  assert.equal(plan.approvalQueue.leads.every((lead) => lead.status === "pending_approval"), true);

  const messages = renderRedditSlackReviewMessages(plan, {
    occurrenceId: "daily-test",
    runUrl: "https://github.com/example-org/example-app/actions/runs/1",
    artifactUrl: "https://github.com/example-org/example-app/actions/runs/1/artifacts/2"
  });
  assert.match(messages.parent.text, /Reddit outreach requests need review/);
  assert.match(messages.parent.text, /awaiting_approval/);
  assert.equal(messages.threadReplies.length, 12);
  assert.match(messages.threadReplies[0]?.text ?? "", /ID: `lead-01`/);
  assert.match(messages.threadReplies[0]?.text ?? "", /Lead 1 &lt;scan&gt; &amp; review/);
  assert.doesNotMatch(messages.parent.text, /schedule approved/i);
}

{
  const reviewed = approveRedditLead({
    leads: Array.from({ length: 12 }, (_, index) => makeLead(index + 1, "pending")),
    leadId: "lead-03",
    approvedAt: "2026-06-01T19:00:00.000Z",
    reviewedBy: "U123"
  });
  const approvedLead = reviewed.lead;
  assert.equal(approvedLead.status, "approved");
  assert.equal(approvedLead.approved, true);
  assert.equal(approvedLead.approvedAt, "2026-06-01T19:00:00.000Z");
  assert.equal(approvedLead.reviewedBy, "U123");

  const plan = createRedditDailyEngagementPlan({
    leads: reviewed.leads,
    generatedAt: "2026-06-01T18:00:00.000Z",
    seed: "approve-click"
  });
  assert.equal(plan.status, "scheduled");
  assert.equal(plan.schedule.approvedLeadCount, 1);
  assert.equal(plan.approvalQueue.leads.find((lead) => lead.id === "lead-03")?.status, "approved");
}

{
  assert.throws(
    () =>
      denyRedditLead({
        leads: Array.from({ length: 12 }, (_, index) => makeLead(index + 1, "pending")),
        leadId: "lead-03",
        reason: " "
      }),
    /deny reason is required/
  );

  const reviewed = denyRedditLead({
    leads: Array.from({ length: 12 }, (_, index) => makeLead(index + 1, "pending")),
    leadId: "lead-03",
    reason: "Wrong audience for this campaign.",
    deniedAt: "2026-06-01T19:30:00.000Z"
  });
  assert.equal(reviewed.lead.status, "rejected");
  assert.equal(reviewed.lead.denialReason, "Wrong audience for this campaign.");
  assert.equal(reviewed.lead.deniedAt, "2026-06-01T19:30:00.000Z");

  const plan = createRedditDailyEngagementPlan({
    leads: reviewed.leads,
    generatedAt: "2026-06-01T18:00:00.000Z"
  });
  const deniedQueueItem = plan.approvalQueue.leads.find((lead) => lead.id === "lead-03");
  assert.equal(deniedQueueItem?.status, "rejected");
  assert.equal(deniedQueueItem?.denialReason, "Wrong audience for this campaign.");
}

{
  const plan = createRedditDailyEngagementPlan({
    leads: mixedApprovalBatch.map((lead, index) => ({
      ...lead,
      account: index % 2 === 0 ? "working_golf" : "this_photo"
    })),
    generatedAt: "2026-06-01T18:00:00.000Z",
    approvedAt: "2026-06-01T19:00:00.000Z",
    seed: "daily-approved"
  });
  assert.equal(plan.status, "scheduled");
  assert.equal(plan.schedule.approvedLeadCount, 12);
  assert.equal(plan.schedule.scheduledDate, "2026-06-02");

  const messages = renderRedditSlackReviewMessages(plan);
  assert.match(messages.parent.text, /Reddit outreach schedule ready/);
  assert.equal(messages.threadReplies.length, 12);
  assert.match(messages.threadReplies[0]?.text ?? "", /Scheduled for:/);
  assert.match(messages.threadReplies[0]?.text ?? "", /Account: `(working_golf|this_photo)`/);
}

{
  const plan = createRedditDailyEngagementPlan({
    leads: Array.from({ length: 12 }, (_, index) => makeProposalLead(index + 1, "pending")),
    generatedAt: "2026-06-01T18:00:00.000Z"
  });
  const proposal = plan.approvalQueue.leads[0];
  assert.equal(proposal?.action, "comment");
  assert.equal(proposal?.username, "zeeskaya");
  assert.equal(proposal?.strategy, "controversial_ingredient");
  assert.equal(proposal?.templateName, "controversial_ingredient/comment/general_recommendation");
  assert.equal(proposal?.keyword, "ingredient checker app");
  assert.equal(proposal?.threadTitle, "half these natural brands are just lying and im over it");
  assert.equal(proposal?.commentLink, "https://www.reddit.com/r/NaturalBeauty/comments/1slq186/comment/oga3scd/");
  assert.equal(proposal?.commentData, "Can you recommend any apps?");
  assert.match(proposal?.proposedReply ?? "", /Have you tried scanning/);
}

{
  const schedule = createRedditEngagementSchedule({
    leads: Array.from({ length: 12 }, (_, index) => makeLead(index + 1)),
    approvedAt: "2026-06-02T02:30:00.000Z",
    generatedAt: "2026-06-02T02:31:00.000Z",
    seed: "late-eastern-approval"
  });

  assert.equal(schedule.scheduledDate, "2026-06-02");
  assert.equal(schedule.slots[0].scheduledFor.startsWith("2026-06-02T"), true);
}

{
  const winterSchedule = createRedditEngagementSchedule({
    leads: Array.from({ length: 12 }, (_, index) => makeLead(index + 1)),
    approvedAt: "2026-01-05T18:00:00.000Z",
    generatedAt: "2026-01-05T18:01:00.000Z",
    seed: "winter-offset"
  });
  const firstHour = localHour(winterSchedule.slots[0].scheduledFor);
  assert.ok(firstHour >= 6 && firstHour < 11);
  assert.match(winterSchedule.slots[0].scheduledLocal, /EST$/);
}

assert.throws(
  () => validateRedditLeadBatch(Array.from({ length: 11 }, (_, index) => makeLead(index + 1))),
  /12-20 leads/
);

assert.throws(
  () => validateRedditLeadBatch(Array.from({ length: 21 }, (_, index) => makeLead(index + 1))),
  /12-20 leads/
);

assert.throws(
  () =>
    createRedditEngagementSchedule({
      leads: Array.from({ length: 12 }, (_, index) => makeLead(index + 1, "pending")),
      approvedAt: "2026-06-01T18:00:00.000Z"
    }),
  /at least one approved lead/
);

assert.throws(
  () =>
    validateRedditLeadBatch([
      makeLead(1),
      makeLead(1),
      ...Array.from({ length: 10 }, (_, index) => makeLead(index + 2))
    ]),
  /duplicate reddit lead id/
);
