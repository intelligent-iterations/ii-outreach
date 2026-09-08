# ii-outreach

[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/intelligent-iterations/ii-outreach/badge)](https://scorecard.dev/viewer/?uri=github.com/intelligent-iterations/ii-outreach)

An MIT-licensed library by Intelligent Iterations.

`ii-outreach` gives an application the rules and state transitions needed to
run Reddit outreach.

It can qualify leads, prepare message drafts, schedule approved messages,
record delivery results, check replies, and calculate outreach statistics.

## What it can do

| Job | What `ii-outreach` does | What your application does |
| --- | --- | --- |
| Find leads | Validates, filters, and deduplicates candidates using your lead standards. | Reads Reddit posts and comments. |
| Draft messages | Builds safe model input and validates each review-only draft. | Runs the model and shows drafts to a reviewer. |
| Send messages | Schedules approved messages and records verified delivery states. | Sends through Reddit and returns the readback. |

It also builds review queues, checks replies, and reports messages sent per day
and total replies.

## What you provide

You need:

- one or more Reddit accounts, each with a private cookie JSON connected in
  your application's Reddit adapter;
- a target audience, communities, keywords, and exclusions;
- one or more example messages;
- a draft mode: `exact`, `adapt`, or `new`;
- a job type: `find_leads`, `draft_messages`, or `send_messages`; and
- your own Reddit adapter, data store, UI, model runner, and job runner.

Pass only a stable account ID and Reddit username to `ii-outreach`. The account
ID must map to that account's cookie file inside your adapter. Keep passwords,
cookie values, file paths, tokens, and browser sessions out of the package.

## What you get back

Calls return plain data for your application to save or act on: a job plan,
qualified leads, review decisions, drafts, schedules, delivery receipts,
reply-check results, or statistics.

`ii-outreach` stores nothing between calls.

## Set up Reddit outreach

### 1. Export one cookie JSON per Reddit account

Finding leads and sending messages require an authenticated Reddit browser.
Your host adapter therefore needs one current cookie JSON for every Reddit
account it will use. Each file must contain only `reddit.com` cookies and must
include `reddit_session`.

Use your application's browser adapter to export the cookies from the account
that will perform the work. Follow that adapter's authentication instructions
and store each export as a private file outside the source checkout. This
library accepts account references only; it does not extract browser cookies.

Cookie files are credentials. Never commit them, paste them into setup data, or
send them to the package.

### 2. Map each cookie file in your Reddit adapter

Your application keeps the secret mapping. For example:

```js
const redditAccounts = {
  "reddit-main": {
    username: "trail_builder",
    cookiesPath: "/private/state/reddit-main.cookies.json"
  }
};
```

`cookiesPath` is adapter configuration, not an `ii-outreach` field. After the
adapter verifies that the cookie belongs to `trail_builder`, give the package
only this safe reference:

```js
{ id: "reddit-main", username: "trail_builder" }
```

The shared ID is the handoff: `ii-outreach` returns `reddit-main` in its job
plan, and your adapter resolves that ID to the matching cookie file.

### 3. Add your lead and message rules

```js
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
      }
    ]
  }
});
```

The setup rejects unsupported fields, duplicate accounts, missing standards,
invalid limits, and unknown job or draft modes.

### 4. Choose a job

Set `jobType` to one of:

- `find_leads` - collect Reddit evidence, then qualify matching people;
- `draft_messages` - turn qualified leads into review-only drafts; or
- `send_messages` - queue messages that a human already approved.

`setup.job.nextAction` tells your application which adapter step comes next.
Changing `jobType` creates a different plan without adding hidden side effects.

### Choose how drafts use your examples

| Mode | Result |
| --- | --- |
| `exact` | Uses the selected example message word for word. |
| `adapt` | Uses the selected example with up to three word changes. You can set a lower limit. |
| `new` | Writes a new message using the selected example only as a style reference. |

The selected mode is enforced when model output is materialized. It is not a
suggestion to the model.

Connect the setup to participant drafting like this:

```js
import {
  participantDraftAliasesFromSetup,
  validateParticipantDraftInput
} from "ii-outreach";

const draftInput = validateParticipantDraftInput({
  campaign,
  candidates,
  aliases: participantDraftAliasesFromSetup(setup),
  draftMode: setup.drafting.mode,
  maxWordChanges: setup.drafting.maxWordChanges
});
```

## Run the working example

Clone the source and run the example with Node.js 22 or later:

```bash
git clone https://github.com/intelligent-iterations/ii-outreach.git
cd ii-outreach
npm ci
npm run build
node examples/quick-start.mjs
```

Expected output:

```json
{
  "job": "draft_messages",
  "accounts": [
    "reddit-main"
  ],
  "communities": 2,
  "keywords": 2,
  "draftMode": "adapt",
  "exampleMessages": 2,
  "maxWordChanges": 3,
  "nextAction": "build_review_only_drafts",
  "humanApprovalRequired": true
}
```

This example proves that the complete setup is valid and shows the exact job
plan returned to the host. It does not browse Reddit or send a message. See
[`examples/quick-start.mjs`](examples/quick-start.mjs).

## Install in another application

Build the package:

```bash
npm run build
```

Install it from your application directory:

```bash
npm install --save /path/to/ii-outreach
```

Import the full framework or individual functions:

```js
import {
  createRedditOutreachSetup,
  outreachFramework
} from "ii-outreach";

console.log(outreachFramework.capabilityNames);
```

## Use the CLI

Show every command:

```bash
npm run start -- help
```

Common tasks:

```bash
npm run start -- review-reddit --leads ./leads.json
npm run start -- approve-reddit --leads ./leads.json \
  --lead-id lead-1 --reviewed-by host:user-123
npm run start -- schedule-reddit --leads ./leads.json \
  --approved-at 2026-09-05T18:00:00Z
```

## Safety rules

- A human approves the final message before delivery.
- AI output creates drafts only.
- Lead discovery requires recent, exact Reddit source evidence.
- Response checks are read-only and never send follow-ups.
- Missing adapters fail explicitly. The package never switches providers.

## Reference

- [Runnable setup example](examples/quick-start.mjs)
- [Framework and adapter guide](docs/stateless-framework.md)
- [Reddit participant workflow](docs/reddit-participant-research.md)
- [Machine-readable API contract](contracts/outreach-framework.v1.json)
- [Example adapter catalog](templates/adapter-catalog/reddit-participant-discovery-catalog.yaml)

Development commands:

```bash
npm run check
npm test
npm run build
npm run generate
```

## License and support

[MIT](LICENSE). See [CONTRIBUTING.md](CONTRIBUTING.md) for development,
[SECURITY.md](SECURITY.md) for private vulnerability reports, and
[the migration guide](docs/migration.md) for changes from the earlier scaffolding.
