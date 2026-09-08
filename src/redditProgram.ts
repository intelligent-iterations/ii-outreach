export type RedditLeadProgram = "aurafarm" | "scanner";
export type RedditLeadIntent = "helpful" | "self_promo";

export interface RedditProgramLead {
  program?: string;
  intent?: string;
  contributionKind?: string;
  contribution_kind?: string;
  strategy?: string;
  templateName?: string;
  template_name?: string;
  proposedReply?: string;
  proposed_reply?: string;
  message?: string;
  suggestedContribution?: string;
  suggested_contribution?: string;
  whyHelpful?: string;
  why_helpful?: string;
  safetyNotes?: string;
  safety_notes?: string;
}

export interface RedditProgramMix {
  helpful: number;
  selfPromo: number;
}

export interface RedditSelfPromotionQuota {
  helpfulPerSelfPromo?: number;
  maxSelfPromo?: number;
}

export const DEFAULT_REDDIT_PROGRAM_MIX: RedditProgramMix = {
  helpful: 8,
  selfPromo: 2
};

export const DEFAULT_HELPFUL_PER_SELF_PROMO = 4;

export function redditLeadProgram(lead: RedditProgramLead): RedditLeadProgram {
  const program = normalizedText(lead.program);
  if (program === "aurafarm" || program === "aura_farm" || program === "helpful") {
    return "aurafarm";
  }
  if (program === "scanner" || program === "self_promo" || program === "self_promotion") {
    return "scanner";
  }

  const intent = normalizedText(lead.intent);
  if (intent === "helpful" || intent === "non_promo" || intent === "non_promotional") {
    return "aurafarm";
  }
  if (intent === "self_promo" || intent === "self_promotion" || intent === "promotion") {
    return "scanner";
  }

  const contributionKind = normalizedText(lead.contributionKind ?? lead.contribution_kind);
  if (contributionKind === "helpful" || contributionKind === "community" || contributionKind === "non_promo") {
    return "aurafarm";
  }

  const strategy = normalizedText(lead.strategy);
  if (strategy.includes("aurafarm") || strategy.includes("aura_farm")) {
    return "aurafarm";
  }
  return "scanner";
}

export function redditLeadIntent(lead: RedditProgramLead): RedditLeadIntent {
  return redditLeadProgram(lead) === "aurafarm" ? "helpful" : "self_promo";
}

export function isAurafarmLead(lead: RedditProgramLead): boolean {
  return redditLeadProgram(lead) === "aurafarm";
}

export function isSelfPromoLead(lead: RedditProgramLead): boolean {
  return redditLeadIntent(lead) === "self_promo";
}

export function countRedditLeadMix(leads: RedditProgramLead[]): RedditProgramMix {
  return leads.reduce(
    (counts, lead) => {
      if (isAurafarmLead(lead)) {
        counts.helpful += 1;
      } else {
        counts.selfPromo += 1;
      }
      return counts;
    },
    { helpful: 0, selfPromo: 0 }
  );
}

export function validateRedditLeadMix(leads: RedditProgramLead[], required: RedditProgramMix): RedditProgramMix {
  const mix = countRedditLeadMix(leads);
  if (mix.helpful !== required.helpful || mix.selfPromo !== required.selfPromo) {
    throw new Error(
      `reddit lead batch must contain ${required.helpful} AuraFarm helpful leads and ${required.selfPromo} scanner self-promo leads; received ${mix.helpful} helpful and ${mix.selfPromo} self-promo`
    );
  }
  return mix;
}

export function selectApprovedRedditLeadsBySelfPromotionQuota<T extends RedditProgramLead>(
  leads: T[],
  quota: RedditSelfPromotionQuota = {}
): T[] {
  const helpfulPerSelfPromo = quota.helpfulPerSelfPromo ?? DEFAULT_HELPFUL_PER_SELF_PROMO;
  if (!Number.isInteger(helpfulPerSelfPromo) || helpfulPerSelfPromo <= 0) {
    throw new Error("reddit self-promotion quota helpfulPerSelfPromo must be a positive integer");
  }

  const helpfulCount = leads.filter(isAurafarmLead).length;
  const selfPromoCount = leads.filter(isSelfPromoLead).length;
  const allowedByHelpful = Math.floor(helpfulCount / helpfulPerSelfPromo);
  const allowedSelfPromo = Math.min(
    selfPromoCount,
    quota.maxSelfPromo ?? selfPromoCount,
    allowedByHelpful
  );

  let includedSelfPromo = 0;
  return leads.filter((lead) => {
    if (isAurafarmLead(lead)) {
      return true;
    }
    if (includedSelfPromo >= allowedSelfPromo) {
      return false;
    }
    includedSelfPromo += 1;
    return true;
  });
}

export function redditContributionLabel(lead: RedditProgramLead): string {
  return isAurafarmLead(lead) ? "AuraFarm helpful" : "Scanner self-promo";
}

export function suggestedContribution(lead: RedditProgramLead): string | undefined {
  return firstText(
    lead.suggestedContribution,
    lead.suggested_contribution,
    lead.proposedReply,
    lead.proposed_reply,
    lead.message
  );
}

export function isPromotionalReplyForAuraFarm(value: string | undefined): boolean {
  const text = value?.trim();
  if (!text) {
    return false;
  }
  return [
    /\bpom\b/i,
    /\b(?:my|our|this)\s+app\b/i,
    /\b(?:pom|ingredient|label|product)\s+app\b/i,
    /\bscanner\s+app\b/i,
    /\bdownload\b/i,
    /\btry\s+(?:the\s+)?(?:pom|my|our|this)\s+app\b/i,
    /\bhttps?:\/\//i,
    /\bwww\./i
  ].some((pattern) => pattern.test(text));
}

function firstText(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.replace(/\s+/g, " ").trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return undefined;
}

function normalizedText(value: string | undefined): string {
  return value?.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") ?? "";
}
