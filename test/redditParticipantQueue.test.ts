import assert from "node:assert/strict";

import {
  activatePendingParticipantMessage,
  allocateParticipantMessageSlot,
  cancelParticipantMessage,
  editParticipantMessage,
  isParticipantDailyWindowSatisfied,
  isParticipantMessageBatchScheduleCurrent,
  isParticipantRateLimitSatisfied,
  queueParticipantMessage,
  type ParticipantMessagingAccount,
  type ParticipantQueuedMessage
} from "../src/participantQueue.js";

const accounts: ParticipantMessagingAccount[] = [
  { id: "account-a", healthy: true },
  { id: "account-b", healthy: true },
  { id: "account-c", healthy: true }
];

function queuedMessage(
  id: string,
  accountId: string,
  scheduledFor: string,
  overrides: Partial<ParticipantQueuedMessage> = {}
): ParticipantQueuedMessage {
  return {
    id,
    workspaceId: "workspace-1",
    campaignId: "campaign-1",
    leadId: `lead-${id}`,
    redditUsername: `user_${id}`,
    normalizedRedditUsername: `user_${id}`,
    message: `Message ${id}`,
    accountId,
    requestedNotBefore: scheduledFor,
    scheduledFor,
    spacingMinutes: 12,
    status: "queued_pending_sender",
    senderEnabledAtQueueTime: false,
    createdBy: "author-1",
    createdAt: "2026-08-07T09:00:00.000Z",
    updatedAt: "2026-08-07T09:00:00.000Z",
    ...overrides
  };
}

{
  const history: ParticipantQueuedMessage[] = [];
  for (let index = 0; index < 193; index += 1) {
    const allocation = allocateParticipantMessageSlot({
      accounts,
      existingMessages: history,
      notBefore: "2026-08-07T10:00:00.000Z",
      spacingMinutes: 12
    });
    history.push(
      queuedMessage(
        `daily-window-${index}`,
        allocation.accountId,
        allocation.scheduledFor,
        { spacingMinutes: allocation.spacingMinutes }
      )
    );
  }
  assert.deepEqual(
    accounts.map((account) => history.slice(0, 192).filter((message) => message.accountId === account.id).length),
    [64, 64, 64]
  );
  assert.equal(isParticipantDailyWindowSatisfied(history.map((message) => message.scheduledFor)), true);
  assert.equal(history[191].scheduledFor, "2026-08-08T01:36:00.000Z");
  assert.equal(history[192].scheduledFor, "2026-08-08T10:00:00.000Z");
}

{
  const summer = allocateParticipantMessageSlot({
    accounts: [{ id: "account-a", healthy: true }],
    existingMessages: [],
    notBefore: "2026-08-08T02:00:00.000Z",
    spacingMinutes: 12
  });
  const winter = allocateParticipantMessageSlot({
    accounts: [{ id: "account-a", healthy: true }],
    existingMessages: [],
    notBefore: "2026-12-08T03:00:00.000Z",
    spacingMinutes: 12
  });
  assert.equal(summer.scheduledFor, "2026-08-08T10:00:00.000Z");
  assert.equal(winter.scheduledFor, "2026-12-08T11:00:00.000Z");
}

{
  const created = queueParticipantMessage({
    id: "message-1",
    workspaceId: "workspace-1",
    campaignId: "campaign-1",
    leadId: "lead-1",
    redditUsername: "u/Example_User",
    message: "I read your comment and wanted to ask about your experience.",
    requestedNotBefore: "2026-08-07T10:00:00.000Z",
    now: "2026-08-07T09:59:00.000Z",
    createdBy: "author-1",
    accounts,
    randomSpacingMinutes: () => 14
  });
  assert.equal(created.status, "queued_pending_sender");
  assert.equal(created.accountId, "account-a");
  assert.equal(created.scheduledFor, "2026-08-07T10:00:00.000Z");
  assert.equal(created.spacingMinutes, 14);
  assert.equal(created.normalizedRedditUsername, "example_user");
}

{
  const history: ParticipantQueuedMessage[] = [];
  for (let index = 0; index < 9; index += 1) {
    const message = queueParticipantMessage({
      id: `distributed-${index}`,
      workspaceId: "workspace-1",
      campaignId: "campaign-1",
      leadId: `distributed-lead-${index}`,
      redditUsername: `distributed_user_${index}`,
      message: `Personal message ${index}`,
      requestedNotBefore: "2026-08-07T10:00:00.000Z",
      now: "2026-08-07T09:00:00.000Z",
      createdBy: "author-1",
      accounts,
      existingMessages: history,
      randomSpacingMinutes: () => 12
    });
    history.push(message);
  }
  assert.deepEqual(
    history.slice(0, 3).map((message) => message.accountId),
    ["account-a", "account-b", "account-c"]
  );
  for (const account of accounts) {
    const times = history.filter((message) => message.accountId === account.id).map((message) => message.scheduledFor);
    assert.equal(isParticipantRateLimitSatisfied(times), true);
  }
}

{
  const history = [0, 12, 24, 36].map((minute, index) =>
    queuedMessage(`rate-${index}`, "account-a", `2026-08-07T10:${String(minute).padStart(2, "0")}:00.000Z`)
  );
  const allocation = allocateParticipantMessageSlot({
    accounts: [{ id: "account-a", healthy: true }],
    existingMessages: history,
    notBefore: "2026-08-07T10:48:00.000Z",
    spacingMinutes: 12
  });
  assert.equal(allocation.scheduledFor, "2026-08-07T11:00:00.000Z");
  assert.equal(isParticipantRateLimitSatisfied([...history.map((item) => item.scheduledFor), allocation.scheduledFor]), true);
}

{
  const pending = queuedMessage("pending", "account-a", "2026-08-07T08:00:00.000Z", {
    requestedNotBefore: "2026-08-07T08:00:00.000Z",
    spacingMinutes: 18
  });
  const activated = activatePendingParticipantMessage({
    message: pending,
    accounts: [
      { id: "account-a", healthy: false },
      { id: "account-b", healthy: true }
    ],
    existingMessages: [pending],
    now: "2026-08-07T12:00:00.000Z",
    approvedBy: "reviewer-1"
  });
  assert.equal(activated.status, "scheduled");
  assert.equal(activated.accountId, "account-b");
  assert.equal(activated.scheduledFor, "2026-08-07T12:00:00.000Z");
  assert.equal(activated.approvedBy, "reviewer-1");
  assert.equal(activated.approvedAt, "2026-08-07T12:00:00.000Z");
  assert.match(activated.approvalMessageSha256 ?? "", /^[a-f0-9]{64}$/);
}

{
  const pending = queuedMessage("editable", "account-a", "2026-08-07T10:00:00.000Z");
  assert.equal(editParticipantMessage(pending, "Updated personal message.").message, "Updated personal message.");
  assert.equal(cancelParticipantMessage(pending).status, "cancelled");
  assert.throws(
    () => cancelParticipantMessage({ ...pending, status: "sent" }),
    /cannot cancel participant message in sent status/
  );
}

{
  const scheduled = queuedMessage("approved-edit", "account-a", "2026-08-07T10:00:00.000Z", {
    status: "scheduled",
    approvedBy: "reviewer-1",
    approvedAt: "2026-08-07T09:30:00.000Z",
    approvalMessageSha256: "old-approval"
  });
  const edited = editParticipantMessage(scheduled, "Changed after approval.", "2026-08-07T09:45:00.000Z");
  assert.equal(edited.status, "queued_pending_sender");
  assert.equal(edited.approvedBy, undefined);
  assert.equal(edited.approvedAt, undefined);
  assert.equal(edited.approvalMessageSha256, undefined);
}

assert.equal(
  isParticipantRateLimitSatisfied([
    "2026-08-07T10:00:00.000Z",
    "2026-08-07T10:12:00.000Z",
    "2026-08-07T10:24:00.000Z",
    "2026-08-07T10:36:00.000Z",
    "2026-08-07T10:48:00.000Z"
  ]),
  false
);

assert.throws(
  () =>
    queueParticipantMessage({
      id: "suppressed",
      workspaceId: "workspace-1",
      campaignId: "campaign-1",
      leadId: "lead-suppressed",
      redditUsername: "suppressed_user",
      message: "Hello",
      now: "2026-08-07T10:00:00.000Z",
      createdBy: "author-1",
      accounts,
      workspaceSuppressedUsernames: ["u/Suppressed_User"]
    }),
  /is suppressed/
);

assert.throws(
  () =>
    queueParticipantMessage({
      id: "too-far",
      workspaceId: "workspace-1",
      campaignId: "campaign-1",
      leadId: "lead-too-far",
      redditUsername: "future_user",
      message: "Hello",
      now: "2026-08-07T10:00:00.000Z",
      requestedNotBefore: "2026-09-07T10:00:01.000Z",
      createdBy: "author-1",
      accounts
    }),
  /more than 30 days ahead/
);

assert.throws(
  () =>
    allocateParticipantMessageSlot({
      accounts: [...accounts, { id: "account-d", healthy: true }],
      existingMessages: [],
      notBefore: "2026-08-07T10:00:00.000Z",
      spacingMinutes: 12
    }),
  /between one and three connected accounts/
);

assert.throws(
  () =>
    queueParticipantMessage({
      id: "unapproved-live-message",
      workspaceId: "workspace-1",
      campaignId: "campaign-1",
      leadId: "lead-unapproved-live-message",
      redditUsername: "unapproved_user",
      message: "Hello",
      now: "2026-08-07T10:00:00.000Z",
      createdBy: "author-1",
      accounts,
      senderEnabled: true
    }),
  /approvedBy is required/
);

assert.throws(
  () =>
    queueParticipantMessage({
      id: "duplicate-after-uncertain-delivery",
      workspaceId: "workspace-1",
      campaignId: "campaign-1",
      leadId: "lead-duplicate-after-uncertain-delivery",
      redditUsername: "uncertain_user",
      message: "Do not duplicate an uncertain delivery.",
      now: "2026-08-07T10:00:00.000Z",
      createdBy: "author-1",
      accounts,
      existingMessages: [
        queuedMessage("uncertain", "account-a", "2026-08-07T09:30:00.000Z", {
          redditUsername: "uncertain_user",
          normalizedRedditUsername: "uncertain_user",
          status: "blocked",
          deliveryUncertain: true
        })
      ]
    }),
  /already has an active or delivered workspace message/
);

const currentBatch = {
  schedulePolicyVersion: 2,
  configuredAccountIds: ["account-a"],
  accounts: [
    {
      accountId: "account-a",
      status: "pending",
      messages: [{ scheduledFor: "2026-08-07T10:12:00.000Z" }]
    }
  ]
};
assert.equal(
  isParticipantMessageBatchScheduleCurrent(currentBatch, ["account-a"], {
    now: "2026-08-07T10:00:00.000Z"
  }),
  true
);
assert.equal(
  isParticipantMessageBatchScheduleCurrent(currentBatch, ["account-a"], {
    now: "2026-08-07T10:13:00.000Z"
  }),
  false
);
assert.equal(
  isParticipantMessageBatchScheduleCurrent(
    { ...currentBatch, schedulePolicyVersion: 1 },
    ["account-a"],
    { now: "2026-08-07T10:00:00.000Z" }
  ),
  false
);
