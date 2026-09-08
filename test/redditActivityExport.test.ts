import assert from "node:assert/strict";
import test from "node:test";

import { parseRedditActivityExport } from "../src/redditActivityExport.js";

const aliases = [
  { username: "working_golf", display_username: "working_golf72" },
  { username: "this_photo", display_username: "this_photo5976" }
];

test("parses Reddit comments, replies, scores, views, and account aliases", () => {
  const parsed = parseRedditActivityExport(`
Skip to Navigation
r/nontoxic
\u2022 Fragrance or Phenoxyethanol?
Working_Golf72  commented 2 days ago
Fragrance can mean anything.
Upvote
1
Downvote
Reply
Share
3 views
See More Insights

r/NaturalBeauty
\u2022 Scented products
Working_Golf72  replied to zeeskaya 3 mo. ago
Umbrella ingredients can be a hidden risk.
Upvote
6
Downvote
Share
609 views
`, {
    importedAt: "2026-08-06T04:44:41.692Z",
    sourceLabel: "user-paste",
    accountAliases: aliases
  });

  assert.equal(parsed.schema_version, "ii.outreach.reddit.activity-export.v1");
  assert.equal(parsed.records.length, 2);
  assert.deepEqual(parsed.records[0], {
    id: parsed.records[0].id,
    account: "working_golf",
    display_account: "Working_Golf72",
    subreddit: "nontoxic",
    kind: "comment",
    action: "comment",
    time_label: "2 days ago",
    posted_at_estimate: "2026-08-04T04:44:41.692Z",
    time_precision: "day",
    title: "Fragrance or Phenoxyethanol?",
    message: "Fragrance can mean anything.",
    score: 1,
    views: 3
  });
  assert.equal(parsed.records[1].action, "reply");
  assert.equal(parsed.records[1].replied_to, "zeeskaya");
  assert.equal(parsed.records[1].posted_at_estimate, "2026-05-06T04:44:41.692Z");
  assert.equal(parsed.records[1].time_precision, "month");
  assert.equal(parsed.records[1].score, 6);
  assert.equal(parsed.records[1].views, 609);
});

test("parses standalone posts and keeps multiline bodies", () => {
  const parsed = parseRedditActivityExport(`
r/test
\u2022 Seed comment
Working_Golf72 OP commented 5 mo. ago
Seed body
Upvote
1
Downvote
Share

Live reddit cookie api direct
r/test
\u20225 mo. ago
Join
Live reddit cookie api direct
Automated live probe
with another line
Repost to another community
Upvote
1
Downvote
0
Go to comments
Repost
Share
16 views
See More Insights

r/Jujutsufolk
\u2022 Anyone else?
This_Photo5976 replied to Ok-Badger-8590 6 mo. ago
Different account reply.
Upvote
-1
Downvote
Share
`, {
    importedAt: "2026-08-06T04:44:41.692Z",
    accountAliases: aliases
  });

  assert.equal(parsed.records.length, 3);
  assert.deepEqual(parsed.records[1], {
    id: parsed.records[1].id,
    account: "working_golf",
    display_account: "Working_Golf72",
    subreddit: "test",
    kind: "post",
    action: "post",
    time_label: "5 mo. ago",
    posted_at_estimate: "2026-03-06T04:44:41.692Z",
    time_precision: "month",
    title: "Live reddit cookie api direct",
    message: "Automated live probe\nwith another line",
    score: 1,
    views: 16
  });
  assert.equal(parsed.records[2].account, "this_photo");
  assert.equal(parsed.records[2].score, -1);
});

test("rejects unsupported relative timestamps instead of inventing dates", () => {
  assert.throws(() => parseRedditActivityExport(`
r/test
\u2022 Example
Working_Golf72 commented recently
Body
Upvote
1
`, { importedAt: "2026-08-06T04:44:41.692Z" }), /no parseable posts or comments/);
});
