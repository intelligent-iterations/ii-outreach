import { createRedditOutreachSetup } from "ii-outreach";

const setup = createRedditOutreachSetup({
  jobType: "draft_messages",
  accounts: [
    { id: "reddit-main", username: "trail_builder" }
  ],
  leadStandards: {
    targetAudience: "Hikers looking for safer ways to plan routes.",
    communities: ["hiking", "trailrunning"],
    keywords: ["route planner", "trail conditions"],
    maxSourceAgeDays: 30,
    excludedUsernames: ["AutoModerator"]
  },
  drafting: {
    mode: "adapt",
    maxWordChanges: 3,
    exampleMessages: [
      {
        id: "friendly-offer",
        name: "Friendly link offer",
        message: "I built example-app for this and can send you the link if you want."
      },
      {
        id: "short-question",
        name: "Short question",
        message: "Would example-app help here? I can send you the link if useful."
      }
    ]
  }
});

process.stdout.write(`${JSON.stringify({
  job: setup.job.type,
  accounts: setup.job.accountIds,
  communities: setup.leadStandards.communities.length,
  keywords: setup.leadStandards.keywords.length,
  draftMode: setup.drafting.mode,
  exampleMessages: setup.drafting.exampleMessages.length,
  maxWordChanges: setup.drafting.maxWordChanges,
  nextAction: setup.job.nextAction,
  humanApprovalRequired: setup.job.humanApprovalRequiredBeforeDelivery
}, null, 2)}\n`);
