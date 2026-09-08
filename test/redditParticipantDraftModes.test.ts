import assert from "node:assert/strict";
import test from "node:test";

import {
  buildParticipantDraftAgentInput,
  buildParticipantDraftPrompt,
  materializeParticipantDraftBatch,
  participantDraftOutputSchema,
  validateParticipantDraftInput
} from "../src/participantDrafts.js";

const campaign = {
  productName: "example-app",
  productUrl: "https://example.test/trailmates",
  productSummary: "Helps hikers plan safer routes with current trail conditions.",
  targetAudience: "People who regularly hike in changing weather.",
  cta: "Offer to send the app link if it would help.",
  valuePropositions: ["Current trail reports", "Route-specific safety notes"],
  competitors: ["sample-project"],
  queries: ["safer hiking route app", "current trail condition planner"],
  participantCommunities: ["careful_hikers"]
};

const rawInput = {
  campaign,
  candidates: [
    {
      leadId: "lead-explicit",
      redditUsername: "route_seeker",
      sourceUrl: "https://www.reddit.com/r/hiking/comments/abc/route_app/",
      sourceText: "Is there an app that warns me when a trail becomes unsafe?",
      sourceKind: "post",
      subreddit: "hiking",
      qualificationNotes: "Explicitly asks for the campaign's product class.",
      qualificationBasis: "explicit_intent_recent_activity"
    },
    {
      leadId: "lead-community",
      redditUsername: "muddy_boots",
      sourceUrl: "https://www.reddit.com/r/careful_hikers/comments/def/rain_gear/ghi/",
      sourceText: "I always check the forecast twice before a long route.",
      sourceKind: "comment",
      subreddit: "careful_hikers",
      qualificationNotes: "Recent activity in a selected participant community.",
      qualificationBasis: "community_assumed_intent"
    }
  ],
  aliases: [
    {
      messageId: "message-1",
      alias: "Friendly problem match",
      message: "Hey, I saw you were looking for sample-project alternatives. I built example-app and can send you the link if you want."
    },
    {
      messageId: "message-2",
      alias: "Short practical note",
      message: "That route planning problem is exactly why I made example-app. Happy to send the link if it sounds useful."
    }
  ]
};

test("draft input derives the two intent modes and carries only campaign-owned context", () => {
  const input = validateParticipantDraftInput(rawInput);
  assert.deepEqual(
    input.candidates.map((candidate) => candidate.intentMode),
    ["high_intent", "community_assumed_intent"]
  );
  assert.equal(input.campaign.productName, "example-app");
  assert.deepEqual(input.campaign.participantCommunities, ["careful_hikers"]);

  const agentInput = buildParticipantDraftAgentInput(input);
  assert.equal(agentInput.campaign.productName, "example-app");
  assert.deepEqual(Object.keys(agentInput.campaign).sort(), [
    "productName",
    "productSummary",
    "targetAudience"
  ]);
  assert.equal(agentInput.candidates[1]?.intentMode, "community_assumed_intent");
});

test("draft prompt is concise, campaign-generic, and distinguishes all draft modes", () => {
  const prompt = buildParticipantDraftPrompt({
    inputPath: "/tmp/disposable/input.json",
    candidateCount: 2,
    aliasCount: 2
  });
  assert.match(prompt, /community_assumed_intent/);
  assert.match(prompt, /`exact`/);
  assert.match(prompt, /`adapt`/);
  assert.match(prompt, /`new`/);
  assert.match(prompt, /offer to send the link/i);
  assert.match(prompt, /no em dash/i);
  assert.match(prompt, /structured word edits/i);
  assert.match(prompt, /zero-based over the selected example split on whitespace/i);
  assert.ok(prompt.trim().split(/\s+/u).length <= 300);
});

test("draft output schema is a compact result array without model-owned evidence", () => {
  const schema = JSON.stringify(participantDraftOutputSchema(2, 2));
  assert.match(schema, /candidateRef/);
  assert.match(schema, /edits/);
  assert.match(schema, /tailoredMessage/);
  assert.doesNotMatch(schema, /researchEvidence/);
  assert.doesNotMatch(schema, /draftsByCandidate/);
});

test("high-intent drafts apply no more than three structured edits to one alias", () => {
  const input = validateParticipantDraftInput(rawInput);
  const batch = materializeParticipantDraftBatch(
    {
      drafts: [
        {
          candidateRef: "candidate-001",
          selectedAliasRef: "alias-001",
          rankedAliasRefs: ["alias-001", "alias-002"],
          edits: [{ operation: "replace", index: 8, value: "trail-safety" }],
          tailoredMessage: "",
          reason: "The author explicitly asks for this product class."
        },
        {
          candidateRef: "candidate-002",
          selectedAliasRef: "alias-002",
          rankedAliasRefs: ["alias-002", "alias-001"],
          edits: [],
          tailoredMessage:
            "Your habit of checking conditions twice made me think example-app could be useful. Happy to send you the link if you want.",
          reason: "It refers to the participant's own planning habit without assuming a product search."
        }
      ]
    },
    input
  );

  assert.equal(batch.drafts[0]?.intentMode, "high_intent");
  assert.equal(batch.drafts[0]?.draftMode, "adapt");
  assert.match(batch.drafts[0]?.message ?? "", /trail-safety\./);
  assert.equal(batch.drafts[0]?.editCount, 1);
  assert.deepEqual(batch.drafts[0]?.researchEvidence, [
    { title: "Exact Reddit source", url: rawInput.candidates[0].sourceUrl }
  ]);
});

test("community-assumed drafts are tailored, concise, branded, and offer a link", () => {
  const input = validateParticipantDraftInput(rawInput);
  const result = materializeParticipantDraftBatch(
    {
      drafts: [
        {
          candidateRef: "candidate-001",
          selectedAliasRef: "alias-001",
          rankedAliasRefs: ["alias-001"],
          edits: [],
          tailoredMessage: "",
          reason: "Explicit product-class request."
        },
        {
          candidateRef: "candidate-002",
          selectedAliasRef: "alias-002",
          rankedAliasRefs: ["alias-002"],
          edits: [],
          tailoredMessage:
            "Checking conditions twice is smart. I built example-app for that kind of planning and can send you the link if you want.",
          reason: "Tailored to the source while preserving the alias's casual grammar."
        }
      ]
    },
    input
  );
  const community = result.drafts[1]!;
  assert.equal(community.intentMode, "community_assumed_intent");
  assert.equal(community.draftMode, "new");
  assert.match(community.message, /example-app/);
  assert.match(community.message, /send you the link/i);
  assert.doesNotMatch(community.message, /\u2014|\u2013|\s-\s/u);
  assert.ok(community.message.split(/\s+/u).length <= 55);
  assert.equal(community.editCount, null);
});

test("exact mode returns the selected example without changes", () => {
  const input = validateParticipantDraftInput({
    ...rawInput,
    draftMode: "exact",
    candidates: [rawInput.candidates[0]]
  });
  const result = materializeParticipantDraftBatch(
    {
      drafts: [{
        candidateRef: "candidate-001",
        selectedAliasRef: "alias-001",
        rankedAliasRefs: ["alias-001"],
        edits: [],
        tailoredMessage: "",
        reason: "This example matches the candidate's request."
      }]
    },
    input
  );

  assert.equal(result.drafts[0]?.draftMode, "exact");
  assert.equal(result.drafts[0]?.message, rawInput.aliases[0].message);
  assert.equal(result.drafts[0]?.editCount, 0);
});

test("adapt mode enforces the configured word-change limit", () => {
  const input = validateParticipantDraftInput({
    ...rawInput,
    draftMode: "adapt",
    maxWordChanges: 1,
    candidates: [rawInput.candidates[0]]
  });
  assert.equal(buildParticipantDraftAgentInput(input).maxWordChanges, 1);
  assert.throws(
    () => materializeParticipantDraftBatch(
      {
        drafts: [{
          candidateRef: "candidate-001",
          selectedAliasRef: "alias-001",
          rankedAliasRefs: ["alias-001"],
          edits: [
            { operation: "replace", index: 8, value: "trail" },
            { operation: "replace", index: 9, value: "safety" }
          ],
          tailoredMessage: "",
          reason: "Two changes exceed the configured limit."
        }]
      },
      input
    ),
    /exceeds the 1-word edit limit/
  );
});

test("new mode creates a completely new message for high-intent candidates", () => {
  const input = validateParticipantDraftInput({
    ...rawInput,
    draftMode: "new",
    candidates: [rawInput.candidates[0]]
  });
  const result = materializeParticipantDraftBatch(
    {
      drafts: [{
        candidateRef: "candidate-001",
        selectedAliasRef: "alias-001",
        rankedAliasRefs: ["alias-001"],
        edits: [],
        tailoredMessage: "Your trail safety question sounds familiar. example-app can help, and I can send you the link.",
        reason: "A new note directly addresses the source question."
      }]
    },
    input
  );

  assert.equal(result.drafts[0]?.draftMode, "new");
  assert.notEqual(result.drafts[0]?.message, rawInput.aliases[0].message);
  assert.equal(result.drafts[0]?.editCount, null);
});

test("new mode rejects an example copied into the tailored message field", () => {
  const input = validateParticipantDraftInput({
    ...rawInput,
    draftMode: "new",
    candidates: [rawInput.candidates[0]]
  });
  assert.throws(
    () => materializeParticipantDraftBatch(
      {
        drafts: [{
          candidateRef: "candidate-001",
          selectedAliasRef: "alias-001",
          rankedAliasRefs: ["alias-001"],
          edits: [],
          tailoredMessage: rawInput.aliases[0].message,
          reason: "This improperly copies the example."
        }]
      },
      input
    ),
    /must be newly written/
  );
});

for (const [name, message, expected] of [
  [
    "missing campaign product name",
    "Checking conditions twice is smart. I can send you the link if you want.",
    /mention the campaign product name/
  ],
  [
    "product name embedded in a longer word",
    "Checking conditions twice is smart. example-appPlus might help and I can send you the link.",
    /mention the campaign product name/
  ],
  [
    "missing link offer",
    "Checking conditions twice is smart. example-app was built for that kind of planning.",
    /offer to send the link/
  ],
  [
    "em dash",
    "Checking conditions twice is smart \u2014 example-app can help and I can send you the link.",
    /must not contain an em dash/
  ]
] as const) {
  test(`community-assumed drafts reject ${name}`, () => {
    const input = validateParticipantDraftInput({
      ...rawInput,
      candidates: [rawInput.candidates[1]]
    });
    assert.throws(
      () =>
        materializeParticipantDraftBatch(
          {
            drafts: [
              {
                candidateRef: "candidate-001",
                selectedAliasRef: "alias-002",
                rankedAliasRefs: ["alias-002"],
                edits: [],
                tailoredMessage: message,
                reason: "Candidate-specific explanation."
              }
            ]
          },
          input
        ),
      expected
    );
  });
}
