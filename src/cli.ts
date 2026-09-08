#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";

import { createRedditApprovalQueue, createRedditDailyEngagementPlan } from "./daily.js";
import {
  parseRedditActivityExport,
  type RedditActivityAccountAlias
} from "./redditActivityExport.js";
import { approveRedditLead, denyRedditLead } from "./review.js";
import { createRedditEngagementSchedule, type RedditLead } from "./scheduling.js";
import {
  createRedditStrategyPlan,
  normalizeRedditStrategyRecords,
  type RedditStrategyRecord,
  type RedditStrategyStateInput
} from "./strategy.js";

interface CliArgs {
  command: string;
  leadsPath?: string;
  approvedAt?: string;
  generatedAt?: string;
  timeZone?: string;
  seed?: string;
  outPath?: string;
  leadId?: string;
  reason?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  statePath?: string;
  legacyAcceptedPromosPath?: string;
  quotaMultiplier?: number;
  preserveSelectedReplies?: boolean;
  inputPath?: string;
  aliasesPath?: string;
  sourceLabel?: string;
}

interface LeadsFile {
  leads?: RedditLead[];
  approvedAt?: string;
  timeZone?: string;
  seed?: string;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === "help") {
    printUsage();
    process.exit(0);
  }
  if (args.command === "strategy-reddit") {
    const state = args.statePath ? readStrategyStateFile(args.statePath) : [];
    const legacyAcceptedPromoRecords = args.legacyAcceptedPromosPath
      ? readStrategyStateFile(args.legacyAcceptedPromosPath)
      : [];
    writeJSON(args.outPath, createRedditStrategyPlan({
      state,
      legacyAcceptedPromoRecords,
      generatedAt: args.generatedAt,
      quotaMultiplier: args.quotaMultiplier
    }));
    return;
  }
  if (args.command === "parse-reddit-activity") {
    const inputPath = requireArg(args.inputPath, "parse-reddit-activity requires --input <path|->");
    const input = readFileSync(inputPath === "-" ? 0 : inputPath, "utf8");
    const accountAliases = args.aliasesPath ? readAccountAliases(args.aliasesPath) : [];
    writeActivityImport(args.outPath, parseRedditActivityExport(input, {
      importedAt: args.generatedAt,
      sourceLabel: args.sourceLabel,
      accountAliases
    }));
    return;
  }
  if (!args.leadsPath) {
    throw new Error(`${args.command} requires --leads <path>`);
  }

  const input = readLeadsFile(args.leadsPath);
  if (args.command === "schedule-reddit") {
    writeJSON(args.outPath, createRedditEngagementSchedule({
      leads: input.leads,
      approvedAt: args.approvedAt ?? input.approvedAt,
      generatedAt: args.generatedAt,
      timeZone: args.timeZone ?? input.timeZone,
      seed: args.seed ?? input.seed
    }));
    return;
  }
  if (args.command === "review-reddit") {
    writeJSON(args.outPath, createRedditApprovalQueue({
      leads: input.leads,
      generatedAt: args.generatedAt,
      timeZone: args.timeZone ?? input.timeZone
    }));
    return;
  }
  if (args.command === "daily-reddit") {
    writeJSON(args.outPath, createRedditDailyEngagementPlan({
      leads: input.leads,
      approvedAt: args.approvedAt ?? input.approvedAt,
      generatedAt: args.generatedAt,
      timeZone: args.timeZone ?? input.timeZone,
      seed: args.seed ?? input.seed,
      preserveSelectedReplies: args.preserveSelectedReplies
    }));
    return;
  }
  if (args.command === "approve-reddit") {
    const result = approveRedditLead({
      leads: input.leads,
      leadId: requireArg(args.leadId, "approve-reddit requires --lead-id <id>"),
      approvedAt: args.reviewedAt,
      reviewedBy: args.reviewedBy
    });
    writeJSON(args.outPath, { ...input, leads: result.leads });
    return;
  }
  if (args.command === "deny-reddit") {
    const result = denyRedditLead({
      leads: input.leads,
      leadId: requireArg(args.leadId, "deny-reddit requires --lead-id <id>"),
      reason: requireArg(args.reason, "deny-reddit requires --reason <text>"),
      deniedAt: args.reviewedAt,
      reviewedBy: args.reviewedBy
    });
    writeJSON(args.outPath, { ...input, leads: result.leads });
    return;
  }

  printUsage();
  process.exit(1);
}

function parseArgs(argv: string[]): CliArgs {
  const [command = "help", ...rest] = argv;
  const args: CliArgs = { command };

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    const next = rest[index + 1];
    if (token === "--leads") {
      args.leadsPath = requireValue(token, next);
      index += 1;
    } else if (token === "--approved-at") {
      args.approvedAt = requireValue(token, next);
      index += 1;
    } else if (token === "--generated-at") {
      args.generatedAt = requireValue(token, next);
      index += 1;
    } else if (token === "--time-zone") {
      args.timeZone = requireValue(token, next);
      index += 1;
    } else if (token === "--seed") {
      args.seed = requireValue(token, next);
      index += 1;
    } else if (token === "--out") {
      args.outPath = requireValue(token, next);
      index += 1;
    } else if (token === "--lead-id") {
      args.leadId = requireValue(token, next);
      index += 1;
    } else if (token === "--reason") {
      args.reason = requireValue(token, next);
      index += 1;
    } else if (token === "--reviewed-at") {
      args.reviewedAt = requireValue(token, next);
      index += 1;
    } else if (token === "--reviewed-by") {
      args.reviewedBy = requireValue(token, next);
      index += 1;
    } else if (token === "--state") {
      args.statePath = requireValue(token, next);
      index += 1;
    } else if (token === "--legacy-accepted-promos") {
      args.legacyAcceptedPromosPath = requireValue(token, next);
      index += 1;
    } else if (token === "--quota-multiplier") {
      args.quotaMultiplier = Number(requireValue(token, next));
      index += 1;
    } else if (token === "--preserve-selected-replies") {
      args.preserveSelectedReplies = true;
    } else if (token === "--input") {
      args.inputPath = requireValue(token, next);
      index += 1;
    } else if (token === "--aliases") {
      args.aliasesPath = requireValue(token, next);
      index += 1;
    } else if (token === "--source-label") {
      args.sourceLabel = requireValue(token, next);
      index += 1;
    } else if (token === "--help" || token === "-h") {
      return { command: "help" };
    } else {
      throw new Error(`unknown argument: ${token}`);
    }
  }

  return args;
}

function writeJSON(path: string | undefined, value: unknown): void {
  const body = `${JSON.stringify(value, null, 2)}\n`;
  if (path) {
    writeFileSync(path, body);
  } else {
    process.stdout.write(body);
  }
}

function writeActivityImport(path: string | undefined, value: unknown): void {
  const body = `${JSON.stringify(value, null, 2)}\n`;
  if (path) {
    writeFileSync(path, body, { flag: "wx", mode: 0o600 });
  } else {
    process.stdout.write(body);
  }
}

function readLeadsFile(path: string): Required<Pick<LeadsFile, "leads">> & Omit<LeadsFile, "leads"> {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as LeadsFile | RedditLead[];
  const input: LeadsFile = Array.isArray(parsed) ? { leads: parsed } : parsed;
  if (!Array.isArray(input.leads)) {
    throw new Error("leads file must contain a JSON array or an object with a leads array");
  }
  return {
    ...input,
    leads: input.leads
  };
}

function readStrategyStateFile(path: string): RedditStrategyRecord[] {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as RedditStrategyStateInput | RedditStrategyRecord[];
  return normalizeRedditStrategyRecords(parsed);
}

function readAccountAliases(path: string): RedditActivityAccountAlias[] {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as { accounts?: RedditActivityAccountAlias[] };
  if (!Array.isArray(parsed.accounts)) {
    throw new Error("Reddit account aliases file must contain an accounts array");
  }
  return parsed.accounts;
}

function requireValue(flag: string, value: string | undefined): string {
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function requireArg(value: string | undefined, message: string): string {
  if (!value || !value.trim()) {
    throw new Error(message);
  }
  return value;
}

function printUsage(): void {
  process.stderr.write(`Usage:
  ii-outreach schedule-reddit --leads <leads.json> [--approved-at <iso>] [--time-zone <iana>] [--seed <seed>]
  ii-outreach review-reddit --leads <leads.json> [--generated-at <iso>] [--time-zone <iana>]
  ii-outreach approve-reddit --leads <leads.json> --lead-id <id> [--reviewed-at <iso>] [--reviewed-by <actor>]
  ii-outreach deny-reddit --leads <leads.json> --lead-id <id> --reason <text> [--reviewed-at <iso>] [--reviewed-by <actor>]
  ii-outreach daily-reddit --leads <leads.json> [--approved-at <iso>] [--generated-at <iso>] [--time-zone <iana>] [--seed <seed>] [--preserve-selected-replies]
  ii-outreach strategy-reddit [--state <strategy-v2.json>] [--legacy-accepted-promos <leads.json>] [--generated-at <iso>] [--quota-multiplier <n>]
  ii-outreach parse-reddit-activity --input <export.txt|-> [--aliases <aliases.json>] [--generated-at <iso>] [--source-label <label>] [--out <import.json>]

Input can be a JSON array of Reddit leads or an object with a leads array.
Lead status must be "approved" or approved must be true before it is scheduled.
Approve writes status "approved" immediately. Deny writes status "rejected" and requires a reason.
daily-reddit returns an approval queue until at least one lead is approved; then it returns the next-day schedule.
strategy-reddit ignores old Slack/channel history and only reads explicit strategy state plus optional accepted promo imports.
parse-reddit-activity converts a Reddit account activity paste into a normalized, read-only history import; relative dates remain approximate.
`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
