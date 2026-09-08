import assert from "node:assert/strict";
import test from "node:test";

import {
  createRedditOutreachSetup,
  participantDraftAliasesFromSetup,
  planRedditOutreachJob
} from "../src/redditOutreachSetup.js";

const baseInput = {
  jobType: "draft_messages",
  accounts: [{ id: "reddit-main", username: "u/trail_builder" }],
  leadStandards: {
    targetAudience: "Hikers looking for safer ways to plan a route.",
    communities: ["r/hiking", "trailrunning"],
    keywords: ["route planner", "trail conditions"],
    excludedUsernames: ["AutoModerator"]
  },
  drafting: {
    mode: "adapt",
    exampleMessages: [
      {
        id: "friendly-offer",
        name: "Friendly link offer",
        message: "I built example-app for this and can send you the link if you want."
      }
    ]
  }
} as const;

test("setup normalizes accounts and lead standards into a runnable job plan", () => {
  const setup = createRedditOutreachSetup(baseInput);

  assert.equal(setup.schemaVersion, "ii-outreach.reddit-setup.v1");
  assert.deepEqual(setup.accounts, [
    { id: "reddit-main", username: "trail_builder", enabled: true }
  ]);
  assert.deepEqual(setup.leadStandards.communities, ["hiking", "trailrunning"]);
  assert.equal(setup.leadStandards.maxSourceAgeDays, 30);
  assert.equal(setup.leadStandards.requireDirectMessageAccess, true);
  assert.equal(setup.leadStandards.requireExactSourceEvidence, true);
  assert.deepEqual(setup.job, {
    type: "draft_messages",
    accountIds: ["reddit-main"],
    nextAction: "build_review_only_drafts",
    humanApprovalRequiredBeforeDelivery: true
  });
  assert.deepEqual(participantDraftAliasesFromSetup(setup), [
    {
      messageId: "friendly-offer",
      alias: "Friendly link offer",
      message: "I built example-app for this and can send you the link if you want."
    }
  ]);
});

test("all three job types produce explicit host actions", () => {
  const setup = createRedditOutreachSetup(baseInput);
  assert.equal(
    planRedditOutreachJob({ ...setup, jobType: "find_leads" }).nextAction,
    "collect_candidate_evidence"
  );
  assert.equal(
    planRedditOutreachJob({ ...setup, jobType: "send_messages" }).nextAction,
    "queue_human_approved_messages"
  );
});

test("draft modes have distinct, bounded edit policies", () => {
  const exact = createRedditOutreachSetup({
    ...baseInput,
    drafting: { ...baseInput.drafting, mode: "exact" }
  });
  const adapted = createRedditOutreachSetup({
    ...baseInput,
    drafting: { ...baseInput.drafting, mode: "adapt", maxWordChanges: 2 }
  });
  const fresh = createRedditOutreachSetup({
    ...baseInput,
    drafting: { ...baseInput.drafting, mode: "new" }
  });

  assert.equal(exact.drafting.maxWordChanges, 0);
  assert.equal(adapted.drafting.maxWordChanges, 2);
  assert.equal(fresh.drafting.maxWordChanges, null);
});

test("setup rejects credentials, duplicate accounts, and disabled-only jobs", () => {
  assert.throws(
    () => createRedditOutreachSetup({
      ...baseInput,
      accounts: [{ id: "reddit-main", username: "trail_builder", password: "do-not-pass-this" }]
    }),
    /unsupported fields: password/
  );
  assert.throws(
    () => createRedditOutreachSetup({
      ...baseInput,
      accounts: [
        { id: "reddit-main", username: "trail_builder" },
        { id: "reddit-main", username: "second_builder" }
      ]
    }),
    /account ids must be unique/
  );
  assert.throws(
    () => createRedditOutreachSetup({
      ...baseInput,
      accounts: [{ id: "reddit-main", username: "trail_builder", enabled: false }]
    }),
    /at least one enabled account/
  );
});
