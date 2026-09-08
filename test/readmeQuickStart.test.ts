import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readme = readFileSync(path.join(packageRoot, "README.md"), "utf8");
const output = execFileSync(
  process.execPath,
  [path.join(packageRoot, "examples", "quick-start.mjs")],
  { cwd: packageRoot, encoding: "utf8" }
);

assert.deepEqual(JSON.parse(output), {
  job: "draft_messages",
  accounts: ["reddit-main"],
  communities: 2,
  keywords: 2,
  draftMode: "adapt",
  exampleMessages: 2,
  maxWordChanges: 3,
  nextAction: "build_review_only_drafts",
  humanApprovalRequired: true
});
assert.ok(readme.includes("node examples/quick-start.mjs"));
assert.ok(readme.includes(output.trim()));
assert.ok(readme.includes("## What it can do"));
assert.ok(readme.includes("## What you provide"));
assert.ok(readme.includes("## What you get back"));
assert.ok(readme.includes("## Set up Reddit outreach"));
assert.ok(readme.includes("### 1. Export one cookie JSON per Reddit account"));
assert.ok(readme.includes("This library" ) || readme.includes("This\nlibrary"));
assert.ok(readme.includes("does not extract browser cookies"));
assert.ok(readme.includes("git clone https://github.com/intelligent-iterations/ii-outreach.git"));
assert.ok(readme.includes("`cookiesPath` is adapter configuration"));
assert.ok(readme.includes("### 4. Choose a job"));
assert.ok(readme.includes("### Choose how drafts use your examples"));
assert.doesNotMatch(readme, /provider readbacks|explicit clock|policy engine/iu);
assert.doesNotMatch(readme, /implementation\//iu);
