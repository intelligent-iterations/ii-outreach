import type { RedditLead } from "./scheduling.js";
import { approveRedditLead, denyRedditLead } from "./review.js";

export type RedditApprovalDecisionStatus = "approved" | "rejected" | "retry_requested" | "replacement_approved";

const OPERATOR_REPLACEMENT_TEMPLATE = "scanner_app/comment/operator_replacement";
const HUMAN_EDITED_APPROVAL_TEMPLATE = "human_edited_approved";

export interface SlackReactionInput {
  name: string;
  users?: string[];
  count?: number;
}

export interface SlackThreadMessageInput {
  ts?: string;
  text?: string;
  user?: string;
  bot_id?: string;
  reactions?: SlackReactionInput[];
}

export interface RedditApprovalDecision {
  leadId: string;
  status: RedditApprovalDecisionStatus;
  source: "slack_text" | "slack_reaction" | "host_application";
  reviewer?: string;
  decidedAt?: string;
  note?: string;
  reason?: string;
  replacementReply?: string;
  approvedReply?: string;
}

export interface RedditApprovalAnalysis {
  decisions: RedditApprovalDecision[];
}

export interface AppliedRedditApprovalDecisions {
  leads: RedditLead[];
  approvedCount: number;
  rejectedCount: number;
  pendingCount: number;
}

const APPROVE_REACTIONS = new Set(["white_check_mark", "heavy_check_mark", "+1", "thumbsup", "approved", "yes"]);
export function analyzeRedditSlackApprovalThread(
  messages: SlackThreadMessageInput[],
  leadIds: string[]
): RedditApprovalAnalysis {
  const decisions: RedditApprovalDecision[] = [];

  for (const message of messages) {
    const text = normalizeText(message.text ?? "");
    decisions.push(...analyzeTextCommand(text, leadIds).map((decision) => ({
      ...decision,
      source: "slack_text" as const,
      reviewer: message.user,
      decidedAt: message.ts,
      note: message.text
    })));

    const messageLeadIds = extractKnownLeadIds(text, leadIds);
    if (messageLeadIds.length > 0) {
      decisions.push(...reactionDecisions(message, messageLeadIds));
    }
  }

  return { decisions };
}

export function applyRedditApprovalDecisions(
  leads: RedditLead[],
  decisions: RedditApprovalDecision[]
): AppliedRedditApprovalDecisions {
  const ordered = decisions
    .map((decision, index) => ({ decision, index }))
    .sort((left, right) => compareDecisionTime(left.decision, right.decision) || left.index - right.index);
  let nextLeads = leads.map((lead) => ({ ...lead }));
  for (const { decision } of ordered) {
    if (decision.status === "approved" || decision.status === "replacement_approved") {
      nextLeads = approveRedditLead({
        leads: nextLeads,
        leadId: decision.leadId,
        approvedAt: decision.decidedAt ? slackTsToDate(decision.decidedAt) : undefined,
        reviewedBy: decision.reviewer
      }).leads;
      if (decision.status === "replacement_approved") {
        nextLeads = applyReplacementReply(nextLeads, decision);
      } else if (decision.approvedReply) {
        nextLeads = applyApprovedReply(nextLeads, decision);
      }
    } else if (decision.status === "rejected") {
      nextLeads = denyRedditLead({
        leads: nextLeads,
        leadId: decision.leadId,
        reason: requireDenialReason(decision),
        deniedAt: decision.decidedAt ? slackTsToDate(decision.decidedAt) : undefined,
        reviewedBy: decision.reviewer
      }).leads;
    }
  }

  let approvedCount = 0;
  let rejectedCount = 0;
  let pendingCount = 0;
  for (const lead of nextLeads) {
    if (lead.status === "approved" || lead.approved === true) {
      approvedCount += 1;
    } else if (lead.status === "rejected") {
      rejectedCount += 1;
    } else {
      pendingCount += 1;
    }
  }

  return { leads: nextLeads, approvedCount, rejectedCount, pendingCount };
}

function analyzeTextCommand(text: string, leadIds: string[]): RedditApprovalDecision[] {
  const parsed = parseCommandPrefix(text);
  if (!parsed) {
    return [];
  }

  const target = parseCommandTarget(parsed.remainder, leadIds);
  if (!target) {
    return [];
  }
  const reason = commandRequiresText(parsed.command) ? decisionRemainder(target.remainder) : undefined;
  if (commandRequiresText(parsed.command) && !reason) {
    return [];
  }

  return target.leadIds.map((leadId) => ({
    leadId,
    status: parsed.command,
    source: "slack_text",
    reason,
    ...(parsed.command === "replacement_approved" ? { replacementReply: reason } : {})
  }));
}

function reactionDecisions(message: SlackThreadMessageInput, leadIds: string[]): RedditApprovalDecision[] {
  const out: RedditApprovalDecision[] = [];
  for (const reaction of message.reactions ?? []) {
    const status = reactionStatus(reaction.name);
    if (!status) {
      continue;
    }
    const reviewers = reaction.users && reaction.users.length > 0 ? reaction.users : [message.user].filter(Boolean);
    for (const leadId of leadIds) {
      if (reviewers.length === 0) {
        out.push({ leadId, status, source: "slack_reaction", decidedAt: message.ts });
      } else {
        out.push(...reviewers.map((reviewer) => ({
          leadId,
          status,
          source: "slack_reaction" as const,
          reviewer,
          decidedAt: message.ts,
          note: `reaction:${reaction.name}`
        })));
      }
    }
  }
  return out;
}

function parseCommandPrefix(text: string): { command: RedditApprovalDecisionStatus; remainder: string } | undefined {
  const match = text.match(/^\s*(approve|approved|yes|ok|okay|reject|rejected|deny|denied|no|retry|redraft|retry_requested|replace|replacement|replacement_approved)\b/i);
  const token = match?.[1]?.toLowerCase();
  if (!match || !token) {
    return undefined;
  }
  let command: RedditApprovalDecisionStatus;
  if (["approve", "approved", "yes", "ok", "okay"].includes(token)) {
    command = "approved";
  } else if (["reject", "rejected", "deny", "denied", "no"].includes(token)) {
    command = "rejected";
  } else if (["retry", "redraft", "retry_requested"].includes(token)) {
    command = "retry_requested";
  } else {
    command = "replacement_approved";
  }
  return { command, remainder: text.slice(match[0].length).trim() };
}

function parseCommandTarget(remainder: string, leadIds: string[]): { leadIds: string[]; remainder: string } | undefined {
  const all = remainder.match(/^all\b/i);
  if (all) {
    return { leadIds, remainder: remainder.slice(all[0].length).trim() };
  }

  let rest = remainder.trim();
  const matchedLeadIds: string[] = [];
  const orderedLeadIds = [...leadIds].sort((left, right) => right.length - left.length);
  while (rest) {
    rest = rest.replace(/^[\s,;]+/, "");
    const nextLeadId = orderedLeadIds.find((leadId) => commandLeadTargetRegex(leadId).test(rest));
    if (!nextLeadId) {
      break;
    }
    const match = rest.match(commandLeadTargetRegex(nextLeadId));
    if (!match) {
      break;
    }
    matchedLeadIds.push(nextLeadId);
    rest = rest.slice(match[0].length);
  }

  return matchedLeadIds.length > 0 ? { leadIds: matchedLeadIds, remainder: rest.trim() } : undefined;
}

function reactionStatus(name: string): RedditApprovalDecisionStatus | undefined {
  const normalized = name.trim().toLowerCase();
  if (APPROVE_REACTIONS.has(normalized)) {
    return "approved";
  }
  return undefined;
}

function extractKnownLeadIds(text: string, leadIds: string[]): string[] {
  return leadIds.filter((leadId) => leadIdRegex(leadId).test(text));
}

function leadIdRegex(leadId: string): RegExp {
  return new RegExp(`(^|[^A-Za-z0-9_.:-])${escapeRegExp(leadId)}($|[^A-Za-z0-9_.:-])`, "i");
}

function compareDecisionTime(left: RedditApprovalDecision, right: RedditApprovalDecision): number {
  return decisionTime(left) - decisionTime(right);
}

function decisionTime(decision: RedditApprovalDecision): number {
  const value = Number(decision.decidedAt);
  return Number.isFinite(value) ? value : 0;
}

function normalizeText(text: string): string {
  return text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function commandRequiresText(command: RedditApprovalDecisionStatus): boolean {
  return command === "rejected" || command === "retry_requested" || command === "replacement_approved";
}

function decisionRemainder(text: string): string | undefined {
  let remainder = text.trim();
  remainder = remainder.replace(/\s+\((button|modal) by <@[A-Z0-9]+>\)\s*$/i, "").trim();
  remainder = remainder.replace(/^(because|reason:?)\s+/i, "").trim();
  return remainder || undefined;
}

function commandLeadTargetRegex(leadId: string): RegExp {
  return new RegExp("^`?" + escapeRegExp(leadId) + "`?(?=$|[\\s,;])", "i");
}

function requireDenialReason(decision: RedditApprovalDecision): string {
  const reason = decision.reason?.trim();
  if (!reason) {
    throw new Error(`denial reason is required for reddit lead: ${decision.leadId}`);
  }
  return reason;
}

function applyReplacementReply(leads: RedditLead[], decision: RedditApprovalDecision): RedditLead[] {
  const replacementReply = requireReplacementReply(decision);
  return leads.map((lead) => {
    if (lead.id !== decision.leadId) {
      return lead;
    }
    return {
      ...lead,
      message: replacementReply,
      proposedReply: replacementReply,
      templateName: OPERATOR_REPLACEMENT_TEMPLATE,
      template_name: undefined
    };
  });
}

function applyApprovedReply(leads: RedditLead[], decision: RedditApprovalDecision): RedditLead[] {
  const approvedReply = decision.approvedReply?.trim();
  if (!approvedReply) {
    throw new Error(`approved reply is required for reddit lead: ${decision.leadId}`);
  }
  return leads.map((lead) => {
    if (lead.id !== decision.leadId) {
      return lead;
    }
    const originalReply = (lead.proposedReply ?? lead.message ?? "").trim();
    return {
      ...lead,
      message: approvedReply,
      proposedReply: approvedReply,
      ...(originalReply === approvedReply
        ? {}
        : {
            templateName: HUMAN_EDITED_APPROVAL_TEMPLATE,
            template_name: undefined
          })
    };
  });
}

function requireReplacementReply(decision: RedditApprovalDecision): string {
  const replacementReply = (decision.replacementReply ?? decision.reason)?.trim();
  if (!replacementReply) {
    throw new Error(`replacement reply is required for reddit lead: ${decision.leadId}`);
  }
  return replacementReply;
}

function slackTsToDate(ts: string): Date | undefined {
  const seconds = Number(ts);
  return Number.isFinite(seconds) ? new Date(seconds * 1000) : undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
