#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contractPath = path.join(packageRoot, "contracts", "outreach-framework.v1.json");
const typescriptPath = path.join(packageRoot, "src", "frameworkContract.generated.ts");
const contractText = readFileSync(contractPath, "utf8");
const contract = JSON.parse(contractText);
const digest = createHash("sha256").update(contractText).digest("hex");

const typescript = renderTypescript(contract, digest);
const dart = renderDart(contract, digest);
const dartArgument = process.argv.find((value) => value.startsWith("--dart-out="));
const dartPath = dartArgument?.slice("--dart-out=".length);
const check = process.argv.includes("--check");

if (check) {
  assertCurrent(typescriptPath, typescript);
  if (dartPath) assertCurrent(path.resolve(dartPath), dart);
} else {
  writeFileSync(typescriptPath, typescript);
  if (dartPath) writeFileSync(path.resolve(dartPath), dart);
}

function assertCurrent(filePath, expected) {
  let actual;
  try {
    actual = readFileSync(filePath, "utf8");
  } catch {
    throw new Error(`generated outreach contract is missing: ${filePath}`);
  }
  if (actual !== expected) {
    throw new Error(
      `generated outreach contract is stale: ${filePath}; run ${path.relative(packageRoot, fileURLToPath(import.meta.url))}`
    );
  }
}

function renderTypescript(value, sha256) {
  const setup = value.setup;
  const participant = value.participant;
  const schedule = participant.schedule;
  const draft = participant.draft;
  const delivery = participant.delivery;
  const responses = participant.responses;
  return `// Generated from contracts/outreach-framework.v1.json. Do not edit.\n` +
    `export const OUTREACH_FRAMEWORK_SCHEMA_VERSION = ${json(value.schemaVersion)};\n` +
    `export const OUTREACH_FRAMEWORK_CONTRACT_SHA256 = ${json(sha256)};\n` +
    `export const OUTREACH_OPERATION_KINDS = ${json(value.operationKinds)} as const;\n` +
    `export const OUTREACH_CAPABILITIES = ${json(value.capabilities)} as const;\n` +
    `export const OUTREACH_ADAPTER_CATALOG_ENTRY_IDS = ${json(value.adapterCatalogEntryIds)} as const;\n` +
    `export const OUTREACH_CAPABILITY_ENTRYPOINTS = ${json(value.capabilityEntrypoints)} as const;\n` +
    `export const OUTREACH_JOB_TYPES = ${json(setup.jobTypes)} as const;\n` +
    `export const OUTREACH_DRAFT_MODES = ${json(setup.draftModes)} as const;\n` +
    `export const OUTREACH_SETUP_MAX_ACCOUNTS = ${setup.maxAccounts};\n` +
    `export const OUTREACH_SETUP_MAX_EXAMPLE_MESSAGES = ${setup.maxExampleMessages};\n` +
    `export const OUTREACH_SETUP_MAX_COMMUNITIES = ${setup.maxCommunities};\n` +
    `export const OUTREACH_SETUP_MAX_KEYWORDS = ${setup.maxKeywords};\n` +
    `export const OUTREACH_SETUP_MAX_SOURCE_AGE_DAYS = ${setup.maxSourceAgeDays};\n` +
    `export const OUTREACH_PARTICIPANT_TARGET_COUNT = ${participant.targetCount};\n` +
    `export const OUTREACH_PARTICIPANT_BATCH_SIZE = ${participant.batchSize};\n` +
    `export const OUTREACH_PARTICIPANT_ACTIVITY_WINDOW_DAYS = ${participant.activityWindowDays};\n` +
    `export const OUTREACH_PARTICIPANT_SCHEDULE_POLICY_VERSION = ${schedule.policyVersion};\n` +
    `export const OUTREACH_PARTICIPANT_MESSAGES_PER_ROLLING_HOUR = ${schedule.messagesPerRollingHour};\n` +
    `export const OUTREACH_PARTICIPANT_MIN_SPACING_MINUTES = ${schedule.minSpacingMinutes};\n` +
    `export const OUTREACH_PARTICIPANT_MAX_SPACING_MINUTES = ${schedule.maxSpacingMinutes};\n` +
    `export const OUTREACH_PARTICIPANT_MAX_SCHEDULE_DAYS = ${schedule.maxScheduleDays};\n` +
    `export const OUTREACH_PARTICIPANT_TIME_ZONE = ${json(schedule.timeZone)};\n` +
    `export const OUTREACH_PARTICIPANT_DAILY_WINDOW_START_HOUR = ${schedule.dailyWindowStartHour};\n` +
    `export const OUTREACH_PARTICIPANT_DAILY_WINDOW_HOURS = ${schedule.dailyWindowHours};\n` +
    `export const OUTREACH_PARTICIPANT_DRAFT_ALIAS_LIMIT = ${draft.aliasLimit};\n` +
    `export const OUTREACH_PARTICIPANT_DRAFT_MAX_WORD_CHANGES = ${draft.maxWordChanges};\n` +
    `export const OUTREACH_PARTICIPANT_DRAFT_MAX_RANKED_ALIASES = ${draft.maxRankedAliases};\n` +
    `export const OUTREACH_PARTICIPANT_DRAFT_MAX_CANDIDATES = ${draft.maxCandidates};\n` +
    `export const OUTREACH_PARTICIPANT_DRAFT_MAX_COMMUNITY_WORDS = ${draft.maxCommunityWords};\n` +
    `export const OUTREACH_PARTICIPANT_SINGLE_MESSAGE_MAX_WAIT_MS = ${delivery.singleMessageMaxWaitMinutes} * 60 * 1000;\n` +
    `export const OUTREACH_PARTICIPANT_BATCH_MAX_WAIT_MS = ${delivery.batchMaxWaitMinutes} * 60 * 1000;\n` +
    `export const OUTREACH_PARTICIPANT_MESSAGE_BATCH_LIMIT = ${delivery.messageBatchLimit};\n` +
    `export const OUTREACH_PARTICIPANT_DELIVERY_READBACK = ${json(delivery.verifiedVia)};\n` +
    `export const OUTREACH_PARTICIPANT_MESSAGE_STATUSES = ${json(delivery.messageStatuses)} as const;\n` +
    `export const OUTREACH_PARTICIPANT_RESPONSE_TARGET_LIMIT = ${responses.targetLimit};\n` +
    `export const OUTREACH_PARTICIPANT_RESPONSE_DEFAULT_BATCH_SIZE = ${responses.defaultBatchSize};\n` +
    `export const OUTREACH_PARTICIPANT_RESPONSE_MAX_BATCH_SIZE = ${responses.maxBatchSize};\n` +
    `export const OUTREACH_PARTICIPANT_RESPONSE_MAX_PER_CHECK = ${responses.maxPerCheck};\n` +
    `export const OUTREACH_PARTICIPANT_RESPONSE_MAX_STORED = ${responses.maxStored};\n` +
    `export const OUTREACH_PARTICIPANT_RESPONSE_READBACK = ${json(responses.verifiedVia)};\n`;
}

function renderDart(value, sha256) {
  const setup = value.setup;
  const participant = value.participant;
  const schedule = participant.schedule;
  const draft = participant.draft;
  const delivery = participant.delivery;
  const responses = participant.responses;
  return `// Generated from ii-outreach contracts/outreach-framework.v1.json. Do not edit.\n` +
    `part of 'outreach_contract.dart';\n\n` +
    `const outreachFrameworkSchemaVersion = ${dartString(value.schemaVersion)};\n` +
    `const outreachFrameworkContractSha256 =\n    ${dartString(sha256)};\n` +
    `const outreachOperationKinds = ${dartSet(value.operationKinds)};\n` +
    `const outreachFrameworkCapabilities = ${dartSet(value.capabilities)};\n` +
    `const outreachAdapterCatalogEntryIds = ${dartSet(value.adapterCatalogEntryIds)};\n` +
    `const outreachJobTypes = ${dartSet(setup.jobTypes)};\n` +
    `const outreachDraftModes = ${dartSet(setup.draftModes)};\n` +
    `const outreachSetupMaxAccounts = ${setup.maxAccounts};\n` +
    `const outreachParticipantTargetCount = ${participant.targetCount};\n` +
    `const outreachParticipantBatchSize = ${participant.batchSize};\n` +
    `const outreachParticipantActivityWindow = Duration(days: ${participant.activityWindowDays});\n` +
    `const outreachParticipantMessagesPerHour = ${schedule.messagesPerRollingHour};\n` +
    `const outreachParticipantSchedulePolicyVersion = ${schedule.policyVersion};\n` +
    `const outreachParticipantMinSpacingMinutes = ${schedule.minSpacingMinutes};\n` +
    `const outreachParticipantMaxSpacingMinutes = ${schedule.maxSpacingMinutes};\n` +
    `const outreachParticipantMaxScheduleDays = ${schedule.maxScheduleDays};\n` +
    `const outreachParticipantDailyWindowTimeZone = ${dartString(schedule.timeZone)};\n` +
    `const outreachParticipantDailyWindowStartHour = ${schedule.dailyWindowStartHour};\n` +
    `const outreachParticipantDailyWindowHours = ${schedule.dailyWindowHours};\n` +
    `const outreachParticipantMaxDispatchWait = Duration(minutes: ${delivery.singleMessageMaxWaitMinutes});\n` +
    `const outreachParticipantBatchMaxDispatchWait = Duration(minutes: ${delivery.batchMaxWaitMinutes});\n` +
    `const outreachParticipantMessageStatuses = ${dartSet(delivery.messageStatuses)};\n` +
    `const outreachParticipantDraftAliasLimit = ${draft.aliasLimit};\n` +
    `const outreachParticipantDraftMaxWordChanges = ${draft.maxWordChanges};\n` +
    `const outreachParticipantDraftMaxRankedAliases = ${draft.maxRankedAliases};\n` +
    `const outreachParticipantDraftMaxCandidates = ${draft.maxCandidates};\n` +
    `const outreachParticipantDraftMaxCommunityWords = ${draft.maxCommunityWords};\n` +
    `const outreachParticipantResponseReadback = ${dartString(responses.verifiedVia)};\n` +
    `const outreachParticipantResponseTargetLimit = ${responses.targetLimit};\n` +
    `const outreachParticipantResponseDefaultBatchSize = ${responses.defaultBatchSize};\n` +
    `const outreachParticipantResponseMaxBatchSize = ${responses.maxBatchSize};\n` +
    `const outreachParticipantMaxResponsesPerCheck = ${responses.maxPerCheck};\n` +
    `const outreachParticipantMaxStoredResponses = ${responses.maxStored};\n`;
}

function json(value) {
  return JSON.stringify(value);
}

function dartString(value) {
  return `'${String(value).replaceAll("'", "\\'")}'`;
}

function dartSet(values) {
  return `{\n${values.map((value) => `  ${dartString(value)},`).join("\n")}\n}`;
}
