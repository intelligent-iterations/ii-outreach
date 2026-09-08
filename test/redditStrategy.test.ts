import assert from "node:assert/strict";

import {
  createRedditStrategyPlan,
  importAcceptedQueuedPromoRecords,
  type RedditStrategyRecord
} from "../src/strategy.js";

function promo(id: string, subreddit: string, extra: Partial<RedditStrategyRecord> = {}): RedditStrategyRecord {
  return {
    id,
    kind: "promo",
    platform: "reddit",
    status: "approved",
    subreddit,
    proposedReply: `Promo reply ${id}`,
    ...extra
  };
}

function aurafarm(id: string, subreddit: string, extra: Partial<RedditStrategyRecord> = {}): RedditStrategyRecord {
  return {
    id,
    kind: "aurafarm",
    platform: "reddit",
    status: "approved",
    subreddit,
    proposedReply: `Aura reply ${id}`,
    ...extra
  };
}

{
  const plan = createRedditStrategyPlan({
    records: [
      aurafarm("old-global-aura", "FoodAllergies", { deliveryStatus: "posted" }),
      { ...promo("rejected-promo", "SaaS"), status: "rejected" }
    ],
    generatedAt: "2026-06-20T12:00:00.000Z"
  });

  assert.equal(plan.version, "strategy-v2");
  assert.equal(plan.nextAction, "run_promo");
  assert.equal(plan.acceptedPromoCount, 0);
  assert.deepEqual(plan.subreddits, []);
}

{
  const imported = importAcceptedQueuedPromoRecords([
    promo("legacy-saas-1", "r/SaaS", { kind: undefined, source: undefined }),
    promo("legacy-saas-2", "SaaS", { kind: undefined, deliveryStatus: "queued" }),
    promo("legacy-natural-1", "NaturalBeauty", { kind: undefined, status: "accepted" }),
    promo("legacy-no-reply", "SaaS", { kind: undefined, proposedReply: undefined, message: undefined }),
    promo("legacy-no-subreddit", "", { kind: undefined }),
    aurafarm("legacy-aura", "SaaS", { kind: "aurafarm" })
  ]);

  assert.deepEqual(imported.map((record) => record.id), [
    "legacy-saas-1",
    "legacy-saas-2",
    "legacy-natural-1"
  ]);
  assert.equal(imported.every((record) => record.kind === "promo"), true);
  assert.equal(imported.every((record) => record.source === "legacy_queued_promo_import"), true);
}

{
  const plan = createRedditStrategyPlan({
    legacyAcceptedPromoRecords: [
      promo("legacy-saas-1", "SaaS", { kind: undefined }),
      promo("legacy-saas-2", "SaaS", { kind: undefined }),
      promo("legacy-saas-3", "SaaS", { kind: undefined }),
      promo("legacy-natural-1", "NaturalBeauty", { kind: undefined })
    ],
    records: [
      aurafarm("saas-accepted-aura", "SaaS", { deliveryStatus: "new" }),
      aurafarm("saas-sent-aura", "SaaS", { deliveryStatus: "posted" }),
      aurafarm("other-accepted-aura", "FoodAllergies", { deliveryStatus: "new" })
    ],
    generatedAt: "2026-06-20T12:00:00.000Z"
  });

  assert.equal(plan.nextAction, "run_aurafarm");
  assert.equal(plan.acceptedPromoCount, 4);
  assert.equal(plan.acceptedPromoSubredditCount, 2);

  const saas = plan.subreddits.find((subreddit) => subreddit.subreddit === "SaaS");
  assert.ok(saas);
  assert.equal(saas.acceptedPromoCount, 3);
  assert.equal(saas.targetAurafarmCount, 12);
  assert.equal(saas.existingAurafarmCount, 2);
  assert.equal(saas.remainingAurafarmCount, 10);
  assert.equal(saas.acceptedAurafarmCount, 2);
  assert.equal(saas.pendingScheduleAurafarmCount, 1);
  assert.deepEqual(saas.pendingScheduleAurafarmIds, ["saas-accepted-aura"]);
  assert.equal(saas.discoveryStatus, "needs_aurafarm");
  assert.equal(saas.scheduleStatus, "ready");

  const natural = plan.subreddits.find((subreddit) => subreddit.subreddit === "NaturalBeauty");
  assert.ok(natural);
  assert.equal(natural.acceptedPromoCount, 1);
  assert.equal(natural.targetAurafarmCount, 4);
  assert.equal(natural.existingAurafarmCount, 0);
  assert.equal(natural.pendingScheduleAurafarmCount, 0);
  assert.equal(natural.scheduleStatus, "skip_no_accepted_aurafarm");
}

assert.throws(
  () => createRedditStrategyPlan({ quotaMultiplier: 0 }),
  /quotaMultiplier must be a positive integer/
);
