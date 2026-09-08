export type ParticipantSourceKind = "post" | "comment";

export type ParticipantQualificationBasis =
  | "community_assumed_intent"
  | "explicit_intent_recent_activity";

export type ParticipantDiscoveryStatus = "running" | "complete" | "partial";

export type ParticipantDiscoveryPauseReason =
  | "sources_exhausted"
  | "reddit_access_blocked";

export interface RedditParticipantCandidate {
  redditUsername?: string;
  author?: string;
  sourceUrl: string;
  sourceText: string;
  sourceKind: ParticipantSourceKind;
  subreddit: string;
  sourceCreatedAt: string;
  interestIntentMatch: boolean;
  dmAvailable: boolean;
  dmVerifiedVia: "reddit_start_chat_button";
  dmVerifiedAt: string;
  qualificationNotes: string;
  discoveredVia?: string;
  discoveredAt?: string;
}

export interface RedditParticipantLead {
  id: string;
  platform: "reddit";
  redditUsername: string;
  normalizedRedditUsername: string;
  redditProfileUrl: string;
  sourceUrl: string;
  sourceText: string;
  sourceKind: ParticipantSourceKind;
  subreddit: string;
  sourceCreatedAt: string;
  qualificationBasis: ParticipantQualificationBasis;
  qualificationNotes: string;
  dmAvailable: true;
  dmVerifiedVia: "reddit_start_chat_button";
  dmVerifiedAt: string;
  evidenceScope: "exact_source";
  discoveredVia?: string;
  discoveredAt: string;
  contactState: "available" | "reserved" | "contacted" | "suppressed";
}

export interface ParticipantDiscoveryCursor {
  scope: "selected_subreddit" | "related_subreddit";
  subreddit: string;
  query: string;
  after?: string;
  exhausted?: boolean;
}

export interface ParticipantDiscoveryState {
  campaignId: string;
  targetAudience: string;
  targetCount: number;
  batchSize: number;
  activityWindowDays: number;
  selectedSubreddits: string[];
  status: ParticipantDiscoveryStatus;
  leads: RedditParticipantLead[];
  cursors: ParticipantDiscoveryCursor[];
  searchedSubreddits: string[];
  pauseReason?: ParticipantDiscoveryPauseReason;
  pauseDetail?: string;
  updatedAt: string;
}

export type ParticipantCandidateRejectionReason =
  | "missing_username"
  | "system_or_deleted_author"
  | "invalid_source_url"
  | "missing_source_evidence"
  | "source_not_recent"
  | "missing_qualification_notes"
  | "no_interest_or_intent"
  | "dm_unavailable"
  | "duplicate_username"
  | "workspace_suppressed";

export interface ParticipantCandidateRejection {
  candidate: RedditParticipantCandidate;
  reason: ParticipantCandidateRejectionReason;
}

export interface MergeParticipantDiscoveryBatchOptions {
  candidates: RedditParticipantCandidate[];
  now?: Date | string;
  workspaceSuppressedUsernames?: Iterable<string>;
  cursors?: ParticipantDiscoveryCursor[];
}

export interface MergeParticipantDiscoveryBatchResult {
  state: ParticipantDiscoveryState;
  accepted: RedditParticipantLead[];
  rejected: ParticipantCandidateRejection[];
}
