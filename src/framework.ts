import { applyRedditApprovalDecisions } from "./approval.js";
import {
  createRedditApprovalQueue,
  createRedditDailyEngagementPlan
} from "./daily.js";
import {
  OUTREACH_ADAPTER_CATALOG_ENTRY_IDS,
  OUTREACH_CAPABILITIES,
  OUTREACH_CAPABILITY_ENTRYPOINTS,
  OUTREACH_FRAMEWORK_CONTRACT_SHA256,
  OUTREACH_FRAMEWORK_SCHEMA_VERSION,
  OUTREACH_OPERATION_KINDS
} from "./frameworkContract.generated.js";
import {
  createParticipantDiscoveryState,
  mergeParticipantDiscoveryBatch,
  pauseParticipantDiscovery,
  resumeParticipantDiscovery
} from "./participantDiscovery.js";
import {
  buildParticipantDraftAgentInput,
  buildParticipantDraftPrompt,
  materializeParticipantDraftBatch,
  participantDraftOutputSchema
} from "./participantDrafts.js";
import {
  beginParticipantMessageDispatch,
  completeParticipantMessageDispatch,
  failParticipantMessageDispatch,
  validateParticipantMessageBatch
} from "./participantDispatch.js";
import {
  participantSubredditNames,
  reuseExistingParticipantQualifications,
  validateExistingParticipantQualification
} from "./participantQualification.js";
import {
  allocateParticipantMessageSlot,
  cancelParticipantMessage,
  isParticipantMessageBatchScheduleCurrent,
  queueParticipantMessage
} from "./participantQueue.js";
import {
  normalizeParticipantResponseTargets,
  participantOutboundMessageStats,
  participantResponseCheckEvent,
  participantResponseTargetBatches,
  participantStoredResponseCounts
} from "./participantResponses.js";
import { planRedditReviewQueueDedup } from "./queueDedup.js";
import {
  createRedditOutreachSetup,
  participantDraftAliasesFromSetup,
  planRedditOutreachJob
} from "./redditOutreachSetup.js";
import { approveRedditLead, denyRedditLead } from "./review.js";
import { createRedditStrategyPlan } from "./strategy.js";

const capabilities = Object.freeze({
  outreach_setup: Object.freeze({
    createRedditOutreachSetup,
    planRedditOutreachJob,
    participantDraftAliasesFromSetup
  }),
  campaigns: Object.freeze({
    createRedditDailyEngagementPlan,
    createRedditStrategyPlan
  }),
  subreddits: Object.freeze({ participantSubredditNames }),
  review_queues: Object.freeze({
    createRedditApprovalQueue,
    approveRedditLead,
    denyRedditLead,
    applyRedditApprovalDecisions,
    planRedditReviewQueueDedup
  }),
  participant_discovery: Object.freeze({
    createParticipantDiscoveryState,
    mergeParticipantDiscoveryBatch,
    pauseParticipantDiscovery,
    resumeParticipantDiscovery,
    reuseExistingParticipantQualifications,
    validateExistingParticipantQualification
  }),
  participant_drafting: Object.freeze({
    buildParticipantDraftAgentInput,
    buildParticipantDraftPrompt,
    participantDraftOutputSchema,
    materializeParticipantDraftBatch
  }),
  participant_scheduling: Object.freeze({
    allocateParticipantMessageSlot,
    queueParticipantMessage,
    isParticipantMessageBatchScheduleCurrent
  }),
  participant_delivery: Object.freeze({
    validateParticipantMessageBatch,
    beginParticipantMessageDispatch,
    completeParticipantMessageDispatch,
    failParticipantMessageDispatch,
    cancelParticipantMessage
  }),
  participant_response_checks: Object.freeze({
    normalizeParticipantResponseTargets,
    participantResponseTargetBatches,
    participantResponseCheckEvent,
    participantStoredResponseCounts
  }),
  outreach_network_analytics: Object.freeze({
    participantOutboundMessageStats,
    participantStoredResponseCounts
  })
});

/**
 * Provider-neutral outreach policy and state transitions.
 *
 * The facade owns no state. Callers supply snapshots, time, randomness and
 * provider results, persist returned state themselves, and execute external
 * effects through explicit adapters.
 */
export const outreachFramework = Object.freeze({
  schemaVersion: OUTREACH_FRAMEWORK_SCHEMA_VERSION,
  contractSha256: OUTREACH_FRAMEWORK_CONTRACT_SHA256,
  operationKinds: OUTREACH_OPERATION_KINDS,
  adapterCatalogEntryIds: OUTREACH_ADAPTER_CATALOG_ENTRY_IDS,
  capabilityNames: OUTREACH_CAPABILITIES,
  capabilityEntrypoints: OUTREACH_CAPABILITY_ENTRYPOINTS,
  capabilities
});
