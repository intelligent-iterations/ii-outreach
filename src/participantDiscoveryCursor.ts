import type { ParticipantDiscoveryCursor } from "./participantDiscoveryTypes.js";
import {
  normalizeSubreddit,
  requiredText,
  selectedSubredditSet
} from "./participantDiscoveryValues.js";

export function mergeParticipantDiscoveryCursors(
  current: ParticipantDiscoveryCursor[],
  additions: ParticipantDiscoveryCursor[],
  selectedSubreddits: string[]
): ParticipantDiscoveryCursor[] {
  const merged = new Map<string, ParticipantDiscoveryCursor>();
  const selected = selectedSubredditSet(selectedSubreddits);

  for (const cursor of [...current, ...additions]) {
    const normalized = normalizeParticipantDiscoveryCursor(cursor, selected);
    merged.set(cursorKey(normalized), normalized);
  }
  return [...merged.values()];
}

function normalizeParticipantDiscoveryCursor(
  cursor: ParticipantDiscoveryCursor,
  selectedSubreddits: ReadonlySet<string>
): ParticipantDiscoveryCursor {
  const subreddit = normalizeSubreddit(cursor.subreddit);
  if (
    cursor.scope === "selected_subreddit" &&
    !selectedSubreddits.has(subreddit.toLowerCase())
  ) {
    throw new Error(
      "participant discovery selected-subreddit cursors must reference a whitelist community"
    );
  }
  return {
    ...cursor,
    subreddit,
    query: requiredText(cursor.query, "cursor.query")
  };
}

function cursorKey(cursor: ParticipantDiscoveryCursor): string {
  return `${cursor.scope}:${cursor.subreddit.toLowerCase()}:${cursor.query.toLowerCase()}`;
}
