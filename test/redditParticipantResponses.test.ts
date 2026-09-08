import assert from "node:assert/strict";

import {
  normalizeParticipantResponseTargets,
  participantOutboundMessageStats,
  participantResponseBatchSize,
  participantResponseCheckEvent,
  participantResponseTargetBatches,
  participantStoredResponseCounts,
  partitionParticipantResponseTargets
} from "../src/participantResponses.js";

const exactConversation = (value: string) => value.includes("chat.reddit.com/room/");

const targets = normalizeParticipantResponseTargets([
  {
    messageId: "message-1",
    accountId: "working_golf",
    redditUsername: "recipient_one",
    outboundMessage: "Original invitation one",
    conversationUrl: "https://chat.reddit.com/room/example-1",
    sentAt: "2026-08-09T03:30:00.000Z",
    knownResponseIds: ["response-1"]
  },
  {
    messageId: "message-2",
    accountId: "working_golf",
    redditUsername: "recipient_two",
    outboundMessage: "Original invitation two",
    conversationUrl: "https://chat.reddit.com/room/example-2",
    sentAt: "2026-08-09T04:30:00.000Z",
    knownResponseIds: []
  },
  {
    messageId: "message-3",
    accountId: "iloveredditdotcom",
    redditUsername: "recipient_three",
    outboundMessage: "Original invitation three",
    conversationUrl: "https://www.reddit.com/user/recipient_three/",
    sentAt: "2026-08-10T04:30:00.000Z",
    knownResponseIds: []
  }
]);

assert.equal(targets.length, 3);
assert.throws(
  () => normalizeParticipantResponseTargets(Array.from({ length: 201 }, () => targets[0])),
  /invalid participant response target list/
);

assert.equal(participantResponseBatchSize(undefined), 10);
assert.equal(participantResponseBatchSize("25"), 25);
assert.throws(() => participantResponseBatchSize(26), /between 1 and 25/);
assert.deepEqual(
  participantResponseTargetBatches(targets, 2).map((batch) => batch.length),
  [2, 1]
);

const partitioned = partitionParticipantResponseTargets(targets, exactConversation);
assert.deepEqual(partitioned.exact.map((target) => target.messageId), ["message-1", "message-2"]);
assert.deepEqual(partitioned.legacy.map((target) => target.messageId), ["message-3"]);

assert.deepEqual(
  participantResponseCheckEvent(
    {
      sender_account: "working_golf72",
      checked_at: "2026-08-09T13:00:00.000Z",
      conversation_url: "https://chat.reddit.com/room/example-1",
      verified_via: "reddit_chat_conversation_readback",
      responses: [
        {
          response_id: "response-2",
          text: "Yes, please send it.",
          received_at: "2026-08-09T12:59:00.000Z",
          observed_at: "2026-08-09T13:00:00.000Z",
          verified_via: "reddit_chat_conversation_readback"
        }
      ]
    },
    "working_golf"
  ),
  {
    accountId: "working_golf",
    checkedAt: "2026-08-09T13:00:00.000Z",
    conversationUrl: "https://chat.reddit.com/room/example-1",
    verifiedVia: "reddit_chat_conversation_readback",
    responses: [
      {
        responseId: "response-2",
        text: "Yes, please send it.",
        receivedAt: "2026-08-09T12:59:00.000Z",
        observedAt: "2026-08-09T13:00:00.000Z",
        verifiedVia: "reddit_chat_conversation_readback"
      }
    ]
  }
);

assert.deepEqual(
  participantOutboundMessageStats(targets, {
    timeZone: "America/Toronto",
    isExactConversationUrl: exactConversation
  }),
  {
    confirmedSentCount: 2,
    reconciliationTargetCount: 1,
    timeZone: "America/Toronto",
    firstSentAt: "2026-08-09T03:30:00.000Z",
    lastSentAt: "2026-08-09T04:30:00.000Z",
    byDay: [
      { date: "2026-08-08", count: 1 },
      { date: "2026-08-09", count: 1 }
    ]
  }
);

assert.deepEqual(
  participantStoredResponseCounts({
    newResponseCount: 1,
    message: { responses: [{ id: "known" }, { id: "new" }] }
  }),
  { responseCount: 2, newResponseCount: 1, respondedConversationCount: 1 }
);
assert.throws(
  () => participantStoredResponseCounts({ message: { responses: "invalid" } }),
  /invalid participant response-check result/
);
