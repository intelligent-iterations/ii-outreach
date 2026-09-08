import type { RedditLead } from "./scheduling.js";

export interface ApproveRedditLeadOptions {
  leads: RedditLead[];
  leadId: string;
  approvedAt?: Date | string;
  reviewedBy?: string;
}

export interface DenyRedditLeadOptions {
  leads: RedditLead[];
  leadId: string;
  reason: string;
  deniedAt?: Date | string;
  reviewedBy?: string;
}

export interface RedditLeadReviewResult {
  leads: RedditLead[];
  lead: RedditLead;
}

export function approveRedditLead(options: ApproveRedditLeadOptions): RedditLeadReviewResult {
  const approvedAt = toValidIso(options.approvedAt ?? new Date(), "approvedAt");
  return updateLead(options.leads, options.leadId, (lead) => {
    const { deniedAt, denialReason, ...rest } = lead;
    return compactLead({
      ...rest,
      status: "approved",
      approved: true,
      approvedAt,
      reviewedBy: trimOptional(options.reviewedBy)
    });
  });
}

export function denyRedditLead(options: DenyRedditLeadOptions): RedditLeadReviewResult {
  const denialReason = options.reason.trim();
  if (!denialReason) {
    throw new Error("deny reason is required");
  }

  const deniedAt = toValidIso(options.deniedAt ?? new Date(), "deniedAt");
  return updateLead(options.leads, options.leadId, (lead) => {
    const { approvedAt, ...rest } = lead;
    return compactLead({
      ...rest,
      status: "rejected",
      approved: false,
      deniedAt,
      denialReason,
      reviewedBy: trimOptional(options.reviewedBy)
    });
  });
}

function updateLead(
  leads: RedditLead[],
  leadId: string,
  updater: (lead: RedditLead) => RedditLead
): RedditLeadReviewResult {
  if (!Array.isArray(leads)) {
    throw new Error("reddit leads must be an array");
  }
  if (!leadId || !leadId.trim()) {
    throw new Error("lead id is required");
  }

  let updatedLead: RedditLead | null = null;
  const updatedLeads = leads.map((lead) => {
    if (lead.id !== leadId) {
      return lead;
    }
    updatedLead = updater(lead);
    return updatedLead;
  });

  if (!updatedLead) {
    throw new Error(`reddit lead not found: ${leadId}`);
  }

  return {
    leads: updatedLeads,
    lead: updatedLead
  };
}

function toValidIso(value: Date | string, fieldName: string): string {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} must be a valid ISO date/time`);
  }
  return date.toISOString();
}

function trimOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function compactLead(lead: RedditLead): RedditLead {
  return Object.fromEntries(Object.entries(lead).filter(([, value]) => value !== undefined)) as RedditLead;
}
