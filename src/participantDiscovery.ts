import {
  OUTREACH_PARTICIPANT_ACTIVITY_WINDOW_DAYS,
  OUTREACH_PARTICIPANT_BATCH_SIZE,
  OUTREACH_PARTICIPANT_TARGET_COUNT
} from "./frameworkContract.generated.js";
import { qualifyParticipantCandidate } from "./participantDiscoveryCandidate.js";
import { mergeParticipantDiscoveryCursors } from "./participantDiscoveryCursor.js";
import type {
  MergeParticipantDiscoveryBatchOptions,
  MergeParticipantDiscoveryBatchResult,
  ParticipantCandidateRejection,
  ParticipantCandidateRejectionReason,
  ParticipantDiscoveryCursor,
  ParticipantDiscoveryPauseReason,
  ParticipantDiscoveryState,
  RedditParticipantCandidate,
  RedditParticipantLead
} from "./participantDiscoveryTypes.js";
import {
  dateNumber,
  normalizeRedditUsername,
  optionalText,
  positiveInteger,
  requiredText,
  selectedSubredditSet,
  uniqueSubreddits,
  validDate
} from "./participantDiscoveryValues.js";

export type {
  MergeParticipantDiscoveryBatchOptions,
  MergeParticipantDiscoveryBatchResult,
  ParticipantCandidateRejection,
  ParticipantDiscoveryCursor,
  ParticipantDiscoveryPauseReason,
  ParticipantDiscoveryState,
  ParticipantDiscoveryStatus,
  ParticipantQualificationBasis,
  ParticipantSourceKind,
  RedditParticipantCandidate,
  RedditParticipantLead
} from "./participantDiscoveryTypes.js";

export { normalizeRedditUsername };

export const DEFAULT_PARTICIPANT_TARGET_COUNT = OUTREACH_PARTICIPANT_TARGET_COUNT;
export const DEFAULT_PARTICIPANT_BATCH_SIZE = OUTREACH_PARTICIPANT_BATCH_SIZE;
export const DEFAULT_PARTICIPANT_ACTIVITY_WINDOW_DAYS =
  OUTREACH_PARTICIPANT_ACTIVITY_WINDOW_DAYS;

interface CreateParticipantDiscoveryStateOptions {
  campaignId: string;
  targetAudience: string;
  targetCount?: number;
  batchSize?: number;
  activityWindowDays?: number;
  selectedSubreddits?: string[];
  now?: Date | string;
}

interface ParticipantDiscoveryConfiguration {
  targetCount: number;
  batchSize: number;
  activityWindowDays: number;
  selectedSubreddits: string[];
}

interface EvaluatedParticipantCandidates {
  accepted: RedditParticipantLead[];
  rejected: ParticipantCandidateRejection[];
}

export function createParticipantDiscoveryState(
  options: CreateParticipantDiscoveryStateOptions
): ParticipantDiscoveryState {
  const campaignId = requiredText(options.campaignId, "campaignId");
  const targetAudience = requiredText(options.targetAudience, "targetAudience");
  const configuration = participantDiscoveryConfiguration(options);

  return {
    campaignId,
    targetAudience,
    ...configuration,
    status: "running",
    leads: [],
    cursors: [],
    searchedSubreddits: [],
    updatedAt: validDate(options.now ?? new Date(), "now").toISOString()
  };
}

export function mergeParticipantDiscoveryBatch(
  current: ParticipantDiscoveryState,
  options: MergeParticipantDiscoveryBatchOptions
): MergeParticipantDiscoveryBatchResult {
  if (current.status === "complete") {
    return { state: current, accepted: [], rejected: [] };
  }
  validateCandidateBatch(options.candidates, current.batchSize);

  const now = validDate(options.now ?? new Date(), "now").toISOString();
  const evaluation = evaluateParticipantCandidates(current, options, now);
  return {
    state: advanceParticipantDiscovery(current, options, evaluation.accepted, now),
    ...evaluation
  };
}

export function pauseParticipantDiscovery(
  current: ParticipantDiscoveryState,
  reason: ParticipantDiscoveryPauseReason,
  detail?: string,
  now: Date | string = new Date()
): ParticipantDiscoveryState {
  if (current.status === "complete") return current;
  return {
    ...current,
    status: "partial",
    pauseReason: reason,
    pauseDetail: optionalText(detail),
    updatedAt: validDate(now, "now").toISOString()
  };
}

export function resumeParticipantDiscovery(
  current: ParticipantDiscoveryState,
  now: Date | string = new Date()
): ParticipantDiscoveryState {
  if (current.status === "complete") return current;
  return {
    ...current,
    status: "running",
    pauseReason: undefined,
    pauseDetail: undefined,
    updatedAt: validDate(now, "now").toISOString()
  };
}

function participantDiscoveryConfiguration(
  options: CreateParticipantDiscoveryStateOptions
): ParticipantDiscoveryConfiguration {
  const targetCount = positiveInteger(
    options.targetCount ?? DEFAULT_PARTICIPANT_TARGET_COUNT,
    "targetCount"
  );
  const batchSize = positiveInteger(
    options.batchSize ?? DEFAULT_PARTICIPANT_BATCH_SIZE,
    "batchSize"
  );
  const activityWindowDays = positiveInteger(
    options.activityWindowDays ?? DEFAULT_PARTICIPANT_ACTIVITY_WINDOW_DAYS,
    "activityWindowDays"
  );
  validateDiscoveryLimits(batchSize, activityWindowDays);

  const selectedSubreddits = uniqueSubreddits(options.selectedSubreddits ?? []);
  if (selectedSubreddits.length === 0) {
    throw new Error("participant discovery requires at least one selected subreddit");
  }
  return { targetCount, batchSize, activityWindowDays, selectedSubreddits };
}

function validateDiscoveryLimits(batchSize: number, activityWindowDays: number): void {
  if (batchSize > DEFAULT_PARTICIPANT_BATCH_SIZE) {
    throw new Error(
      `participant discovery batchSize cannot exceed ${DEFAULT_PARTICIPANT_BATCH_SIZE}`
    );
  }
  if (activityWindowDays > 90) {
    throw new Error("participant discovery activityWindowDays cannot exceed 90");
  }
}

function validateCandidateBatch(
  candidates: RedditParticipantCandidate[],
  batchSize: number
): void {
  if (!Array.isArray(candidates) || candidates.length > batchSize) {
    throw new Error(`participant discovery batch must contain at most ${batchSize} candidates`);
  }
}

function evaluateParticipantCandidates(
  current: ParticipantDiscoveryState,
  options: MergeParticipantDiscoveryBatchOptions,
  now: string
): EvaluatedParticipantCandidates {
  const knownUsernames = new Set(
    current.leads.map((lead) => lead.normalizedRedditUsername)
  );
  const suppressedUsernames = normalizedUsernameSet(options.workspaceSuppressedUsernames);
  const selectedSubreddits = selectedSubredditSet(current.selectedSubreddits);
  const accepted: RedditParticipantLead[] = [];
  const rejected: ParticipantCandidateRejection[] = [];

  for (const candidate of newestCandidatesFirst(options.candidates)) {
    const qualification = qualifyParticipantCandidate(candidate, {
      selectedSubreddits,
      activityWindowDays: current.activityWindowDays,
      fallbackDiscoveredAt: now
    });
    if (!qualification.accepted) {
      rejected.push({ candidate, reason: qualification.reason });
      continue;
    }

    const conflict = participantUsernameConflict(
      qualification.lead.normalizedRedditUsername,
      knownUsernames,
      suppressedUsernames
    );
    if (conflict) {
      rejected.push({ candidate, reason: conflict });
      continue;
    }

    knownUsernames.add(qualification.lead.normalizedRedditUsername);
    accepted.push(qualification.lead);
    if (current.leads.length + accepted.length >= current.targetCount) break;
  }
  return { accepted, rejected };
}

function advanceParticipantDiscovery(
  current: ParticipantDiscoveryState,
  options: MergeParticipantDiscoveryBatchOptions,
  accepted: RedditParticipantLead[],
  now: string
): ParticipantDiscoveryState {
  const leads = [...current.leads, ...accepted].slice(0, current.targetCount);
  const cursors = mergeParticipantDiscoveryCursors(
    current.cursors,
    options.cursors ?? [],
    current.selectedSubreddits
  );
  return {
    ...current,
    status: leads.length >= current.targetCount ? "complete" : "running",
    leads,
    cursors,
    searchedSubreddits: searchedSubreddits(current, cursors),
    pauseReason: undefined,
    pauseDetail: undefined,
    updatedAt: now
  };
}

function newestCandidatesFirst(
  candidates: RedditParticipantCandidate[]
): RedditParticipantCandidate[] {
  return [...candidates].sort(
    (left, right) => dateNumber(right.sourceCreatedAt) - dateNumber(left.sourceCreatedAt)
  );
}

function normalizedUsernameSet(values?: Iterable<string>): Set<string> {
  const usernames = [...(values ?? [])]
    .map(normalizeRedditUsername)
    .filter((value): value is string => Boolean(value));
  return new Set(usernames);
}

function participantUsernameConflict(
  username: string,
  knownUsernames: ReadonlySet<string>,
  suppressedUsernames: ReadonlySet<string>
): ParticipantCandidateRejectionReason | undefined {
  if (knownUsernames.has(username)) return "duplicate_username";
  if (suppressedUsernames.has(username)) return "workspace_suppressed";
  return undefined;
}

function searchedSubreddits(
  current: ParticipantDiscoveryState,
  cursors: ParticipantDiscoveryCursor[]
): string[] {
  return uniqueSubreddits([
    ...current.searchedSubreddits,
    ...cursors.map((cursor) => cursor.subreddit)
  ]);
}
