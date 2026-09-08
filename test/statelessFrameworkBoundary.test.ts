import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const frameworkModules = [
  "approval.ts",
  "daily.ts",
  "framework.ts",
  "frameworkContract.generated.ts",
  "participantDiscovery.ts",
  "participantDiscoveryCandidate.ts",
  "participantDiscoveryCursor.ts",
  "participantDiscoveryTypes.ts",
  "participantDiscoveryValues.ts",
  "participantDraftMaterialization.ts",
  "participantDrafts.ts",
  "participantDispatch.ts",
  "participantQualification.ts",
  "participantQueue.ts",
  "participantResponses.ts",
  "queueDedup.ts",
  "review.ts",
  "scheduling.ts",
  "strategy.ts"
];

for (const moduleName of frameworkModules) {
  const source = readFileSync(path.join(packageRoot, "src", moduleName), "utf8");
  assert.doesNotMatch(source, /\bfetch\s*\(/u, `${moduleName} must not open a network`);
  assert.doesNotMatch(source, /\bprocess\.env\b/u, `${moduleName} must not read credentials or host state`);
  assert.doesNotMatch(
    source,
    /from\s+["']node:(?:fs|http|https|net|tls|child_process)["']/u,
    `${moduleName} must not own persistence, transport, or processes`
  );
}
