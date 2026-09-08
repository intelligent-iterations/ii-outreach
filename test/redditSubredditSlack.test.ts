import assert from "node:assert/strict";

import { createRedditDailyEngagementPlan } from "../src/daily.js";
import { renderRedditSlackReviewMessagesBySubreddit } from "../src/subredditSlack.js";
import type { RedditLead } from "../src/scheduling.js";

function makeLead(index: number, subreddit: string): RedditLead {
  return {
    id: `${subreddit.toLowerCase()}-${index}`,
    platform: "reddit",
    kind: index % 2 === 0 ? "aurafarm" : "promo",
    status: "pending",
    subreddit,
    title: `${subreddit} lead ${index}`,
    url: `https://www.reddit.com/r/${subreddit}/comments/${index}`
  };
}

{
  const plan = createRedditDailyEngagementPlan({
    leads: [
      ...Array.from({ length: 6 }, (_, index) => makeLead(index + 1, "SaaS")),
      ...Array.from({ length: 6 }, (_, index) => makeLead(index + 1, "NaturalBeauty"))
    ],
    generatedAt: "2026-06-20T12:00:00.000Z"
  });
  const grouped = renderRedditSlackReviewMessagesBySubreddit(plan, { occurrenceId: "strategy-v2" });

  assert.equal(grouped.length, 2);
  assert.deepEqual(grouped.map((group) => group.subreddit), ["NaturalBeauty", "SaaS"]);

  const natural = grouped[0];
  assert.match(natural.parent.text, /r\/NaturalBeauty Reddit outreach/);
  assert.match(natural.parent.text, /Occurrence: `strategy-v2:subreddit:naturalbeauty`/);
  assert.equal(natural.threadReplies.length, 6);
  assert.match(natural.threadReplies[0]?.text ?? "", /Kind: `(promo|aurafarm)`/);

  const saas = grouped[1];
  assert.match(saas.parent.text, /r\/SaaS Reddit outreach/);
  assert.match(saas.parent.text, /Occurrence: `strategy-v2:subreddit:saas`/);
  assert.equal(saas.threadReplies.length, 6);
  assert.ok(saas.threadReplies.every((reply) => /Subreddit: r\/SaaS/.test(reply.text)));
}
