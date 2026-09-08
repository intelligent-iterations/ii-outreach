import assert from "node:assert/strict";

import {
  PARTICIPANT_BATCH_MAX_WAIT_MS,
  PARTICIPANT_SINGLE_MESSAGE_MAX_WAIT_MS,
  beginParticipantMessageDispatch,
  completeParticipantMessageDispatch,
  failParticipantMessageDispatch,
  participantDispatchEventFromResult,
  validateParticipantMessageBatch
} from "../src/participantDispatch.js";
import { queueParticipantMessage } from "../src/participantQueue.js";

function approvedMessage() {
  return queueParticipantMessage({
    id: "message-1",
    workspaceId: "workspace-1",
    campaignId: "campaign-1",
    leadId: "lead-1",
    redditUsername: "recipient_user",
    message: "A human-reviewed participant message.",
    requestedNotBefore: "2026-08-07T10:00:00.000Z",
    now: "2026-08-07T09:30:00.000Z",
    createdBy: "author-1",
    accounts: [{ id: "sender_user", healthy: true }],
    senderEnabled: true,
    approvedBy: "reviewer-1",
    approvedAt: "2026-08-07T09:30:00.000Z",
    randomSpacingMinutes: () => 12
  });
}

{
  const dispatching = beginParticipantMessageDispatch({
    message: approvedMessage(),
    now: "2026-08-07T10:00:00.000Z"
  });
  assert.equal(dispatching.status, "dispatching");
  assert.equal(dispatching.dispatchAttemptCount, 1);

  const sent = completeParticipantMessageDispatch({
    message: dispatching,
    receipt: {
      senderAccountId: "sender_user",
      conversationUrl: "https://chat.reddit.com/room/example",
      sentAt: "2026-08-07T10:00:05.000Z",
      verifiedVia: "reddit_chat_message_readback"
    }
  });
  assert.equal(sent.status, "sent");
  assert.equal(sent.sentAt, "2026-08-07T10:00:05.000Z");
  assert.equal(sent.verifiedVia, "reddit_chat_message_readback");
}

assert.throws(
  () =>
    beginParticipantMessageDispatch({
      message: { ...approvedMessage(), message: "Changed outside the queue helper." },
      now: "2026-08-07T10:00:00.000Z"
    }),
  /changed after approval/
);

assert.equal(PARTICIPANT_SINGLE_MESSAGE_MAX_WAIT_MS, 5.5 * 60 * 60 * 1000);
assert.equal(PARTICIPANT_BATCH_MAX_WAIT_MS, 72 * 60 * 60 * 1000);

assert.deepEqual(
  validateParticipantMessageBatch(
    {
      batchId: "batch-1",
      accountId: "sender_user",
      messages: [
        { messageId: "later", scheduledFor: "2026-08-07T10:18:00.000Z" },
        { messageId: "first", scheduledFor: "2026-08-07T10:00:00.000Z" }
      ]
    },
    { batchId: "batch-1", accountId: "sender_user" }
  ),
  [
    { messageId: "first", scheduledFor: "2026-08-07T10:00:00.000Z" },
    { messageId: "later", scheduledFor: "2026-08-07T10:18:00.000Z" }
  ]
);
assert.throws(
  () =>
    validateParticipantMessageBatch(
      {
        batchId: "batch-1",
        accountId: "sender_user",
        messages: [
          { messageId: "same", scheduledFor: "2026-08-07T10:00:00.000Z" },
          { messageId: "same", scheduledFor: "2026-08-07T10:18:00.000Z" }
        ]
      },
      { batchId: "batch-1", accountId: "sender_user" }
    ),
  /invalid participant message batch entry/
);

assert.deepEqual(
  participantDispatchEventFromResult(
    {
      status: "sent",
      message: {
        sentAt: "2026-08-07T10:00:05.000Z",
        conversationUrl: "https://chat.reddit.com/room/example",
        verifiedVia: "reddit_chat_message_readback"
      }
    },
    { dispatchLeaseId: "lease-1", accountId: "sender_user" }
  ),
  {
    dispatchLeaseId: "lease-1",
    status: "sent",
    senderAccountId: "sender_user",
    sentAt: "2026-08-07T10:00:05.000Z",
    conversationUrl: "https://chat.reddit.com/room/example",
    verifiedVia: "reddit_chat_message_readback"
  }
);

{
  const claimed = beginParticipantMessageDispatch({
    message: approvedMessage(),
    now: "2026-08-07T10:00:00.000Z"
  });
  const accepted = beginParticipantMessageDispatch({
    message: claimed,
    now: "2026-08-07T10:00:01.000Z",
    alreadyClaimed: true
  });
  assert.equal(accepted, claimed);
  assert.throws(
    () =>
      beginParticipantMessageDispatch({
        message: claimed,
        now: "2026-08-07T10:00:01.000Z"
      }),
    /only scheduled/
  );
}

assert.throws(
  () =>
    beginParticipantMessageDispatch({
      message: approvedMessage(),
      now: "2026-08-07T09:59:59.000Z"
    }),
  /not due yet/
);

{
  const dispatching = beginParticipantMessageDispatch({
    message: approvedMessage(),
    now: "2026-08-07T10:00:00.000Z"
  });
  const blocked = failParticipantMessageDispatch({
    message: dispatching,
    code: "unverified_send",
    error: "Reddit accepted the click but readback was inconclusive.",
    retryable: true,
    deliveryUncertain: true,
    now: "2026-08-07T10:00:10.000Z"
  });
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.deliveryUncertain, true);

  const failed = failParticipantMessageDispatch({
    message: dispatching,
    code: "login_required",
    error: "Cookies expired before the chat was opened.",
    retryable: true,
    now: "2026-08-07T10:00:10.000Z"
  });
  assert.equal(failed.status, "failed");
}
