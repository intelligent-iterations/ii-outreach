import assert from "node:assert/strict";

import {
  buildExistingParticipantQualificationPrompt,
  isRetryableParticipantRedditAccessError,
  participantDiscoverySnapshot,
  participantQualificationCampaign,
  participantSubredditNames,
  requireCompleteParticipantDiscovery,
  reuseExistingParticipantQualifications,
  validateExistingParticipantQualification
} from "../src/participantQualification.js";

const leads = [
  {
    id: "community-lead",
    redditUsername: "community_user",
    normalizedRedditUsername: "community_user",
    contactState: "available",
    eligibilityState: "active",
    subreddit: "careful_hikers",
    sourceUrl: "https://www.reddit.com/r/careful_hikers/comments/post/topic/comment1/",
    sourceText: "A recent comment in a manually selected community."
  },
  {
    id: "explicit-lead",
    redditUsername: "explicit_user",
    normalizedRedditUsername: "explicit_user",
    contactState: "reserved",
    eligibilityState: "active",
    subreddit: "hiking",
    sourceUrl: "https://www.reddit.com/r/hiking/comments/post/topic/comment2/",
    sourceText: "sample-project keeps missing closures. Is there a safer alternative?"
  }
];

assert.deepEqual(participantSubredditNames(["r/Hiking", { name: "hiking" }, { name: "Trails" }]), [
  "hiking",
  "Trails"
]);
assert.deepEqual(
  participantQualificationCampaign({
    productManifest: {
      name: "example-app",
      summary: "Current trail conditions.",
      competitors: ["sample-project"]
    },
    queries: ["safe hiking route app"],
    participantSubreddits: [{ name: "careful_hikers" }]
  }),
  {
    productName: "example-app",
    productUrl: "",
    productSummary: "Current trail conditions.",
    targetAudience: "",
    cta: "",
    valuePropositions: [],
    competitors: ["sample-project"],
    queries: ["safe hiking route app"],
    participantCommunities: ["careful_hikers"]
  }
);

const prompt = buildExistingParticipantQualificationPrompt({
  leads,
  selectedSubreddits: ["careful_hikers"],
  campaign: { productName: "example-app", competitors: ["sample-project"] }
});
assert.match(prompt, /campaign product class/);
assert.match(prompt, /example-app/);
assert.doesNotMatch(prompt, /ingredient|Yuka|EWG|scanner|nontoxic/i);

const audit = validateExistingParticipantQualification(
  {
    entries: [
      {
        leadId: "community-lead",
        explicitIntentMatch: true,
        reason: "The exact source is in the selected participant community."
      },
      {
        leadId: "explicit-lead",
        explicitIntentMatch: true,
        reason: "The author requests an alternative to the named competitor."
      }
    ]
  },
  { leads, selectedSubreddits: ["careful_hikers"] }
);
assert.equal(audit.auditedLeadCount, 2);
assert.equal(audit.outsideWhitelistCount, 1);
assert.equal(audit.removalCount, 0);
assert.match(audit.auditHash, /^[a-f0-9]{64}$/);

const snapshot = participantDiscoverySnapshot({
  leads,
  excludedRedditUsernames: ["u/historical_user"]
});
assert.equal(snapshot.participantCount, 1);
assert.deepEqual(snapshot.availableLeads.map((lead) => lead.id), ["community-lead"]);
assert.equal(snapshot.excludedUsernames.has("historical_user"), true);

const reused = reuseExistingParticipantQualifications({
  leads,
  selectedSubreddits: ["careful_hikers"]
});
assert.equal(reused.reusedLeadCount, 2);
assert.equal(reused.auditedLeadCount, 0);

assert.equal(isRetryableParticipantRedditAccessError({ code: "reddit_access_blocked" }), true);
assert.equal(
  isRetryableParticipantRedditAccessError({ code: "account_setup_unhealthy", retryable: true }),
  false
);
assert.doesNotThrow(() =>
  requireCompleteParticipantDiscovery({ participantCount: 200, state: "complete" })
);
assert.throws(
  () => requireCompleteParticipantDiscovery({ participantCount: 180, state: "partial" }),
  /180 of 200 qualified users/
);
