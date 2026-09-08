import assert from "node:assert/strict";

import { planRedditReviewQueueDedup, type RedditReviewQueueSnapshot } from "../src/queueDedup.js";
import { redditPostedTargetKey } from "../src/redditPostedLedger.js";
import type { RedditLead } from "../src/scheduling.js";

function lead(id: string, url: string, status: RedditLead["status"] = "pending"): RedditLead {
  return { id, platform: "reddit", status, url };
}

function queue(queueId: string, persistedAt: string, leads: RedditLead[]): RedditReviewQueueSnapshot {
  return { queueId, persistedAt, leads };
}

const postA = "https://www.reddit.com/r/vegan/comments/abc123/some_thread/";
const postB = "https://www.reddit.com/r/beauty/comments/def456/another_thread/";
const postC = "https://www.reddit.com/r/SkincareAddiction/comments/ghi789/third_thread/";

// Target keys canonicalize URL variants of the same post.
{
  assert.equal(redditPostedTargetKey(postA), "reddit:post:abc123");
  assert.equal(
    redditPostedTargetKey("https://reddit.com/r/vegan/comments/ABC123/renamed_slug"),
    "reddit:post:abc123"
  );
  assert.equal(
    redditPostedTargetKey("https://www.reddit.com/r/vegan/comments/abc123/some_thread/xyz9/"),
    "reddit:comment:abc123:xyz9"
  );
}

// Same target pending in two queues: the older queue's copy is superseded.
{
  const plan = planRedditReviewQueueDedup([
    queue("old-queue", "2026-06-05T00:00:00.000Z", [lead("lead-old", postA), lead("lead-keep-old", postB)]),
    queue("new-queue", "2026-06-11T00:00:00.000Z", [lead("lead-new", postA)])
  ]);
  assert.equal(plan.pendingCount, 3);
  assert.equal(plan.supersessions.length, 1);
  const superseded = plan.supersessions[0];
  assert.equal(superseded.queueId, "old-queue");
  assert.equal(superseded.leadId, "lead-old");
  assert.equal(superseded.keptQueueId, "new-queue");
  assert.equal(superseded.keptLeadId, "lead-new");
}

// A pending copy of an already-decided target is superseded regardless of queue age.
{
  const plan = planRedditReviewQueueDedup(
    [queue("only-queue", "2026-06-11T00:00:00.000Z", [lead("lead-pending", postA), lead("lead-fresh", postC)])],
    [{ targetKey: "reddit:post:abc123", leadId: "lead-other", source: "denied", queueId: "earlier-queue" }]
  );
  assert.equal(plan.supersessions.length, 1);
  assert.equal(plan.supersessions[0].leadId, "lead-pending");
  assert.equal(plan.supersessions[0].decidedSource, "denied");
}

// A decision record pointing at the same queue+lead does not supersede itself.
{
  const plan = planRedditReviewQueueDedup(
    [queue("only-queue", "2026-06-11T00:00:00.000Z", [lead("lead-pending", postA)])],
    [{ targetKey: "reddit:post:abc123", leadId: "lead-pending", source: "queued", queueId: "only-queue" }]
  );
  assert.equal(plan.supersessions.length, 0);
}

// Non-pending leads are never superseded and unique targets are untouched.
{
  const plan = planRedditReviewQueueDedup([
    queue("old-queue", "2026-06-05T00:00:00.000Z", [lead("lead-rejected", postA, "rejected")]),
    queue("new-queue", "2026-06-11T00:00:00.000Z", [lead("lead-a", postB), lead("lead-b", postC)])
  ]);
  assert.equal(plan.pendingCount, 2);
  assert.equal(plan.supersessions.length, 0);
}

// Leads without URLs fall back to lead-id identity.
{
  const noUrlLead: RedditLead = { id: "shared-id", platform: "reddit", status: "pending" };
  const plan = planRedditReviewQueueDedup([
    queue("old-queue", "2026-06-05T00:00:00.000Z", [noUrlLead]),
    queue("new-queue", "2026-06-11T00:00:00.000Z", [{ ...noUrlLead }])
  ]);
  assert.equal(plan.supersessions.length, 1);
  assert.equal(plan.supersessions[0].queueId, "old-queue");
}

console.log("redditQueueDedup tests passed");
