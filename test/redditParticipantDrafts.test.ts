import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildParticipantDraftAgentInput,
  buildParticipantDraftPrompt,
  PARTICIPANT_DRAFT_MAX_CANDIDATES,
  participantDraftAliasRef,
  participantDraftCandidateRef,
  participantDraftOutputSchema,
  participantDraftWordChanges,
  validateParticipantDraftInput
} from "../src/participantDrafts.js";

const campaign = {
  productName: "HarborGuide",
  productUrl: "https://example.test/harbor-guide",
  productSummary: "Helps paddlers choose routes using current harbor conditions.",
  targetAudience: "Recreational paddlers planning day trips.",
  cta: "Offer to send the app link.",
  valuePropositions: ["Current conditions", "Route notes"],
  competitors: ["TideBook"],
  queries: ["safe paddling route app"],
  participantCommunities: ["weekend_paddlers"]
};

const rawInput = {
  campaign,
  candidates: [
    {
      leadId: "lead-1",
      redditUsername: "route_reader",
      sourceUrl: "https://www.reddit.com/r/paddling/comments/example/route_question/",
      sourceText: "Is there an app that shows current conditions for a paddling route?",
      sourceKind: "post",
      subreddit: "paddling",
      qualificationNotes: "Explicitly asks for the campaign product class.",
      qualificationBasis: "explicit_intent_recent_activity"
    }
  ],
  aliases: [
    {
      messageId: "message-1",
      alias: "Direct product request",
      message: "I saw you were looking for TideBook alternatives. I built HarborGuide and can send the link if you want."
    }
  ]
};

test("participant instructions are concise Markdown owned by the package", () => {
  const template = readFileSync(
    new URL("../prompts/reddit-participant-message-alias-selection.md", import.meta.url),
    "utf8"
  );
  assert.match(template, /community_assumed_intent/);
  assert.match(
    template,
    /discard examples that contradict the person's stance or need/i
  );
  assert.match(template, /use wording overlap only as a tiebreaker/i);
  assert.match(template, /follow each candidate's `draftMode` exactly/i);
  assert.match(template, /selected example will be used unchanged/i);
  assert.match(template, /edit index is zero-based over the selected example split on whitespace/i);
  assert.match(template, /\{\{CANDIDATE_COUNT\}\}/);
  assert.match(template, /\{\{MAX_WORD_CHANGES\}\}/);

  const prompt = buildParticipantDraftPrompt({
    inputPath: "/tmp/disposable/input.json",
    candidateCount: 1,
    aliasCount: 1
  });
  assert.doesNotMatch(prompt, /\{\{[A-Z0-9_]+\}\}/);
  assert.ok(prompt.trim().split(/\s+/u).length <= 300);
});

test("participant input validates all dynamic campaign context and adds stable refs", () => {
  const input = validateParticipantDraftInput(rawInput);
  assert.deepEqual(input.campaign, campaign);
  assert.equal(input.candidates[0]?.intentMode, "high_intent");
  const agentInput = buildParticipantDraftAgentInput(input);
  assert.equal(agentInput.candidates[0]?.candidateRef, "candidate-001");
  assert.equal(agentInput.candidates[0]?.draftMode, "adapt");
  assert.equal(agentInput.maxWordChanges, 3);
  assert.equal(agentInput.aliases[0]?.aliasRef, "alias-001");
  assert.deepEqual(Object.keys(agentInput.campaign).sort(), [
    "productName",
    "productSummary",
    "targetAudience"
  ]);
  assert.deepEqual(Object.keys(agentInput.candidates[0] ?? {}).sort(), [
    "candidateRef",
    "draftMode",
    "intentMode",
    "sourceText",
    "subreddit"
  ]);
  assert.deepEqual(Object.keys(agentInput.aliases[0] ?? {}).sort(), [
    "alias",
    "aliasRef",
    "message"
  ]);
  assert.doesNotMatch(
    JSON.stringify(agentInput),
    /lead-1|route_reader|reddit\.com|message-1|qualificationNotes|qualificationBasis|sentAt|safe paddling route app|weekend_paddlers/
  );
});

test("legacy qualification bases map to the two current modes during migration", () => {
  const community = validateParticipantDraftInput({
    ...rawInput,
    candidates: [{ ...rawInput.candidates[0], qualificationBasis: "whitelist_recent_activity" }]
  });
  const explicit = validateParticipantDraftInput({
    ...rawInput,
    candidates: [{ ...rawInput.candidates[0], qualificationBasis: "manifest_intent_recent_activity" }]
  });
  assert.equal(community.candidates[0]?.intentMode, "community_assumed_intent");
  assert.equal(explicit.candidates[0]?.intentMode, "high_intent");
});

test("participant output schema contains compact model-owned fields only", () => {
  const schema = JSON.stringify(participantDraftOutputSchema(1, 1));
  assert.match(schema, /candidateRef/);
  assert.match(schema, /selectedAliasRef/);
  assert.match(schema, /edits/);
  assert.match(schema, /tailoredMessage/);
  assert.doesNotMatch(schema, /leadId|status|researchEvidence|messageId/);
});

test("participant reference and batch bounds are explicit", () => {
  assert.equal(participantDraftCandidateRef(0), "candidate-001");
  assert.equal(participantDraftCandidateRef(199), "candidate-200");
  assert.equal(participantDraftAliasRef(0), "alias-001");
  assert.throws(() => participantDraftCandidateRef(PARTICIPANT_DRAFT_MAX_CANDIDATES));
  assert.throws(() => participantDraftOutputSchema(0, 1));
  assert.throws(() => participantDraftOutputSchema(201, 1));
});

test("participant draft word changes use whitespace-token edit distance", () => {
  assert.equal(participantDraftWordChanges("one two three", "one two three"), 0);
  assert.equal(participantDraftWordChanges("one two three", "one four three"), 1);
  assert.equal(participantDraftWordChanges("one two three", "zero one four three"), 2);
  assert.equal(participantDraftWordChanges("one two three", "zero one four five"), 3);
});

test("participant inputs reject duplicates and oversized batches", () => {
  assert.throws(
    () => validateParticipantDraftInput({ ...rawInput, candidates: [rawInput.candidates[0], rawInput.candidates[0]] }),
    /duplicate candidate identifiers/
  );
  assert.throws(
    () =>
      validateParticipantDraftInput({
        ...rawInput,
        candidates: Array.from({ length: 201 }, (_, index) => ({
          ...rawInput.candidates[0],
          leadId: `lead-${index}`
        }))
      }),
    /one to 200 candidates/
  );
});
