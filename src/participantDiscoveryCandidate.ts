import type {
  ParticipantCandidateRejectionReason,
  ParticipantQualificationBasis,
  RedditParticipantCandidate,
  RedditParticipantLead
} from "./participantDiscoveryTypes.js";
import {
  normalizeRedditUsername,
  normalizeSubreddit,
  optionalText,
  validDate
} from "./participantDiscoveryValues.js";

const SYSTEM_USERNAMES = new Set(["[deleted]", "deleted", "automoderator"]);
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const SOURCE_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

interface ParticipantQualificationContext {
  selectedSubreddits: ReadonlySet<string>;
  activityWindowDays: number;
  fallbackDiscoveredAt: string;
}

interface ParticipantIdentity {
  redditUsername: string;
  normalizedRedditUsername: string;
}

interface ParticipantSourceEvidence {
  sourceUrl: string;
  sourceText: string;
  subreddit: string;
  sourceCreatedAt: string;
  qualificationNotes: string;
  fromSelectedSubreddit: boolean;
}

type CandidateCheck<T> =
  | { accepted: true; value: T }
  | { accepted: false; reason: ParticipantCandidateRejectionReason };

export type ParticipantCandidateQualification =
  | { accepted: true; lead: RedditParticipantLead }
  | { accepted: false; reason: ParticipantCandidateRejectionReason };

export function qualifyParticipantCandidate(
  candidate: RedditParticipantCandidate,
  context: ParticipantQualificationContext
): ParticipantCandidateQualification {
  const identity = participantIdentity(candidate);
  if (!identity.accepted) return identity;

  const evidence = participantSourceEvidence(candidate, context);
  if (!evidence.accepted) return evidence;

  const qualificationBasis = participantQualificationBasis(candidate, evidence.value);
  if (!qualificationBasis.accepted) return qualificationBasis;

  const verifiedDates = participantVerifiedDates(candidate, context.fallbackDiscoveredAt);
  if (!verifiedDates.accepted) return verifiedDates;

  return {
    accepted: true,
    lead: buildParticipantLead(
      candidate,
      identity.value,
      evidence.value,
      qualificationBasis.value,
      verifiedDates.value
    )
  };
}

function participantIdentity(
  candidate: RedditParticipantCandidate
): CandidateCheck<ParticipantIdentity> {
  const redditUsername = optionalText(candidate.redditUsername) ?? optionalText(candidate.author);
  const normalizedRedditUsername = normalizeRedditUsername(redditUsername);
  if (!redditUsername || !normalizedRedditUsername) {
    return { accepted: false, reason: "missing_username" };
  }
  if (isSystemUsername(normalizedRedditUsername)) {
    return { accepted: false, reason: "system_or_deleted_author" };
  }
  return {
    accepted: true,
    value: {
      redditUsername: redditUsername.replace(/^u\//i, ""),
      normalizedRedditUsername
    }
  };
}

function participantSourceEvidence(
  candidate: RedditParticipantCandidate,
  context: ParticipantQualificationContext
): CandidateCheck<ParticipantSourceEvidence> {
  const sourceUrl = optionalText(candidate.sourceUrl);
  if (!sourceUrl || !isExactRedditSourceUrl(sourceUrl)) {
    return { accepted: false, reason: "invalid_source_url" };
  }

  const sourceText = optionalText(candidate.sourceText);
  if (!sourceText) {
    return { accepted: false, reason: "missing_source_evidence" };
  }

  const subreddit = normalizeSubreddit(candidate.subreddit);
  const sourceCreatedAt = recentSourceDate(
    candidate.sourceCreatedAt,
    context.fallbackDiscoveredAt,
    context.activityWindowDays
  );
  if (!sourceCreatedAt) {
    return { accepted: false, reason: "source_not_recent" };
  }

  const qualificationNotes = optionalText(candidate.qualificationNotes);
  if (!qualificationNotes) {
    return { accepted: false, reason: "missing_qualification_notes" };
  }

  return {
    accepted: true,
    value: {
      sourceUrl,
      sourceText,
      subreddit,
      sourceCreatedAt,
      qualificationNotes,
      fromSelectedSubreddit: context.selectedSubreddits.has(subreddit.toLowerCase())
    }
  };
}

function participantQualificationBasis(
  candidate: RedditParticipantCandidate,
  evidence: ParticipantSourceEvidence
): CandidateCheck<ParticipantQualificationBasis> {
  if (!evidence.fromSelectedSubreddit && candidate.interestIntentMatch !== true) {
    return { accepted: false, reason: "no_interest_or_intent" };
  }
  return {
    accepted: true,
    value: evidence.fromSelectedSubreddit
      ? "community_assumed_intent"
      : "explicit_intent_recent_activity"
  };
}

function participantVerifiedDates(
  candidate: RedditParticipantCandidate,
  fallbackDiscoveredAt: string
): CandidateCheck<{ discoveredAt: string; dmVerifiedAt: string }> {
  if (candidate.dmAvailable !== true || candidate.dmVerifiedVia !== "reddit_start_chat_button") {
    return { accepted: false, reason: "dm_unavailable" };
  }
  return {
    accepted: true,
    value: {
      discoveredAt: validDate(
        candidate.discoveredAt ?? fallbackDiscoveredAt,
        "discoveredAt"
      ).toISOString(),
      dmVerifiedAt: validDate(candidate.dmVerifiedAt, "dmVerifiedAt").toISOString()
    }
  };
}

function buildParticipantLead(
  candidate: RedditParticipantCandidate,
  identity: ParticipantIdentity,
  evidence: ParticipantSourceEvidence,
  qualificationBasis: ParticipantQualificationBasis,
  dates: { discoveredAt: string; dmVerifiedAt: string }
): RedditParticipantLead {
  return {
    id: participantLeadId(identity.normalizedRedditUsername, evidence.sourceUrl),
    platform: "reddit",
    redditUsername: identity.redditUsername,
    normalizedRedditUsername: identity.normalizedRedditUsername,
    redditProfileUrl: redditProfileUrl(identity.normalizedRedditUsername),
    sourceUrl: evidence.sourceUrl,
    sourceText: evidence.sourceText,
    sourceKind: candidate.sourceKind,
    subreddit: evidence.subreddit,
    sourceCreatedAt: evidence.sourceCreatedAt,
    qualificationBasis,
    qualificationNotes: evidence.qualificationNotes,
    dmAvailable: true,
    dmVerifiedVia: "reddit_start_chat_button",
    dmVerifiedAt: dates.dmVerifiedAt,
    evidenceScope: "exact_source",
    discoveredVia: optionalText(candidate.discoveredVia),
    discoveredAt: dates.discoveredAt,
    contactState: "available"
  };
}

function isSystemUsername(username: string): boolean {
  return SYSTEM_USERNAMES.has(username) || username.endsWith("bot");
}

function redditProfileUrl(username: string): string {
  return `https://www.reddit.com/user/${encodeURIComponent(username)}/`;
}

function isExactRedditSourceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (!/(^|\.)reddit\.com$/i.test(url.hostname)) return false;
    return /^\/r\/[^/]+\/comments\/[^/]+(?:\/[^/]+)?(?:\/[^/]+)?\/?$/i.test(
      url.pathname
    );
  } catch {
    return false;
  }
}

function recentSourceDate(
  value: string,
  nowValue: string,
  activityWindowDays: number
): string | undefined {
  const source = new Date(value);
  const now = new Date(nowValue);
  if (Number.isNaN(source.getTime()) || Number.isNaN(now.getTime())) return undefined;

  const oldest = now.getTime() - activityWindowDays * MILLISECONDS_PER_DAY;
  const latest = now.getTime() + SOURCE_FUTURE_TOLERANCE_MS;
  return source.getTime() >= oldest && source.getTime() <= latest
    ? source.toISOString()
    : undefined;
}

function participantLeadId(username: string, sourceUrl: string): string {
  return `reddit-participant-${username}-${hashString(sourceUrl).toString(16).padStart(8, "0")}`;
}

function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
