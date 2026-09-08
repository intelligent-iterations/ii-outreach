import assert from "node:assert/strict";

import {
  createParticipantDiscoveryState,
  mergeParticipantDiscoveryBatch,
  pauseParticipantDiscovery,
  resumeParticipantDiscovery,
  type RedditParticipantCandidate
} from "../src/participantDiscovery.js";

function candidate(index: number, overrides: Partial<RedditParticipantCandidate> = {}): RedditParticipantCandidate {
  return {
    redditUsername: `Participant_${index}`,
    sourceUrl: `https://www.reddit.com/r/research/comments/post${index}/question/comment${index}/`,
    sourceText: `I am actively looking for a tool that solves problem ${index}.`,
    sourceKind: "comment",
    subreddit: "research",
    sourceCreatedAt: "2026-08-07T09:45:00.000Z",
    interestIntentMatch: true,
    dmAvailable: true,
    dmVerifiedVia: "reddit_start_chat_button",
    dmVerifiedAt: "2026-08-07T09:55:00.000Z",
    qualificationNotes: "The exact comment asks for a tool in the campaign mission sphere.",
    discoveredVia: "selected subreddit: tool recommendation",
    ...overrides
  };
}

let state = createParticipantDiscoveryState({
  campaignId: "campaign-1",
  targetAudience: "People actively looking for a product-label research tool",
  selectedSubreddits: ["r/research"],
  now: "2026-08-07T12:00:00.000Z"
});

for (let batch = 0; batch < 10; batch += 1) {
  const start = batch * 20;
  const result = mergeParticipantDiscoveryBatch(state, {
    candidates: Array.from({ length: 20 }, (_, offset) => candidate(start + offset + 1)),
    now: `2026-08-07T12:${String(batch).padStart(2, "0")}:00.000Z`,
    cursors: [
      {
        scope: batch === 0 ? "selected_subreddit" : "related_subreddit",
        subreddit: batch === 0 ? "research" : `related${batch}`,
        query: "product-label research tool",
        after: `cursor-${batch}`
      }
    ]
  });
  state = result.state;
  assert.equal(result.accepted.length, 20);
}

assert.equal(state.status, "complete");
assert.equal(state.leads.length, 200);
assert.equal(new Set(state.leads.map((lead) => lead.normalizedRedditUsername)).size, 200);
assert.equal(state.leads.every((lead) => lead.evidenceScope === "exact_source"), true);
assert.equal(state.leads[0].redditProfileUrl, "https://www.reddit.com/user/participant_1/");
assert.equal(state.searchedSubreddits.includes("related9"), true);

{
  const initial = createParticipantDiscoveryState({
    campaignId: "campaign-dedup",
    targetAudience: "People asking for a research tool",
    selectedSubreddits: ["research"],
    now: "2026-08-07T12:00:00.000Z"
  });
  const first = mergeParticipantDiscoveryBatch(initial, {
    candidates: [
      candidate(1),
      candidate(2, { redditUsername: "u/Participant_1" }),
      candidate(3, { redditUsername: "[deleted]" }),
      candidate(4, { interestIntentMatch: false, subreddit: "OtherResearch" }),
      candidate(7, { dmAvailable: false }),
      candidate(5, { sourceText: " " }),
      candidate(6, { sourceUrl: "https://www.reddit.com/search/?q=tool" }),
      candidate(7, { qualificationNotes: " " }),
      candidate(8, { redditUsername: "Suppressed_User" }),
      candidate(9, { redditUsername: "ResearchBot" })
    ],
    workspaceSuppressedUsernames: ["u/suppressed_user"],
    now: "2026-08-07T12:01:00.000Z"
  });
  assert.equal(first.accepted.length, 1);
  assert.deepEqual(
    first.rejected.map((item) => item.reason),
    [
      "duplicate_username",
      "system_or_deleted_author",
      "no_interest_or_intent",
      "dm_unavailable",
      "missing_source_evidence",
      "invalid_source_url",
      "missing_qualification_notes",
      "workspace_suppressed",
      "system_or_deleted_author"
    ]
  );
}

{
  const initial = createParticipantDiscoveryState({
    campaignId: "campaign-resume",
    targetAudience: "People asking for a research tool",
    selectedSubreddits: ["research"],
    now: "2026-08-07T12:00:00.000Z"
  });
  const partial = pauseParticipantDiscovery(
    initial,
    "sources_exhausted",
    "Selected and related subreddit cursors are exhausted.",
    "2026-08-07T13:00:00.000Z"
  );
  assert.equal(partial.status, "partial");
  assert.equal(partial.pauseReason, "sources_exhausted");
  const resumed = resumeParticipantDiscovery(partial, "2026-08-08T13:00:00.000Z");
  assert.equal(resumed.status, "running");
  assert.equal(resumed.pauseReason, undefined);
}

assert.throws(
  () =>
    mergeParticipantDiscoveryBatch(
      createParticipantDiscoveryState({
        campaignId: "too-big",
        targetAudience: "test",
        selectedSubreddits: ["research"]
      }),
      { candidates: Array.from({ length: 21 }, (_, index) => candidate(index + 1)) }
    ),
  /at most 20 candidates/
);

{
  const initial = createParticipantDiscoveryState({
    campaignId: "campaign-recent-selected",
    targetAudience: "People asking for an ingredient research tool",
    selectedSubreddits: ["CleanEating", "FoodAllergies"],
    now: "2026-08-09T12:00:00.000Z"
  });
  const result = mergeParticipantDiscoveryBatch(initial, {
    candidates: [
      candidate(1, {
        subreddit: "FoodAllergies",
        sourceCreatedAt: "2026-08-08T09:00:00.000Z",
        interestIntentMatch: false
      }),
      candidate(2, {
        subreddit: "UnselectedCommunity",
        sourceCreatedAt: "2026-08-09T09:00:00.000Z"
      }),
      candidate(3, {
        subreddit: "CleanEating",
        sourceCreatedAt: "2026-06-01T09:00:00.000Z"
      }),
      candidate(4, {
        subreddit: "AnotherCommunity",
        sourceCreatedAt: "2026-08-07T09:00:00.000Z",
        interestIntentMatch: false
      })
    ],
    now: "2026-08-09T12:00:00.000Z"
  });
  assert.deepEqual(
    result.accepted.map((lead) => lead.redditUsername),
    ["Participant_2", "Participant_1"]
  );
  assert.deepEqual(
    result.accepted.map((lead) => lead.qualificationBasis),
    ["explicit_intent_recent_activity", "community_assumed_intent"]
  );
  assert.deepEqual(
    result.rejected.map((item) => item.reason),
    ["no_interest_or_intent", "source_not_recent"]
  );
}

assert.throws(
  () =>
    createParticipantDiscoveryState({
      campaignId: "no-sources",
      targetAudience: "test",
      selectedSubreddits: []
    }),
  /at least one selected subreddit/
);
