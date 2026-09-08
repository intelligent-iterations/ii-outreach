import { redditLeadTargetKey } from "./redditPostedLedger.js";
import type { RedditLead } from "./scheduling.js";

export interface RedditReviewQueueSnapshot {
  queueId: string;
  /** ISO timestamp the queue was persisted; newer queues win duplicate ties. */
  persistedAt?: string;
  leads: RedditLead[];
}

export interface RedditDecidedTargetRecord {
  /** Canonical target key (see redditLeadTargetKey) or lead id when no URL exists. */
  targetKey?: string;
  leadId?: string;
  /** Where the decision came from: posted | denied | reviewed_approved | scheduled. */
  source: string;
  queueId?: string;
}

export interface RedditQueueDedupSupersession {
  queueId: string;
  leadId: string;
  targetKey?: string;
  reason: string;
  /** Set when the duplicate loses to a pending copy in a newer queue. */
  keptQueueId?: string;
  keptLeadId?: string;
  /** Set when the duplicate loses to an existing decision (posted/denied/approved/scheduled). */
  decidedSource?: string;
}

export interface RedditQueueDedupPlan {
  supersessions: RedditQueueDedupSupersession[];
  pendingCount: number;
}

/**
 * Plans which pending review leads are duplicates and should be superseded.
 *
 * A pending lead is superseded when its target already has a decision
 * (posted, denied, approved, or scheduled) or when the same target is
 * pending in a newer queue. The newest pending copy is always kept.
 */
export function planRedditReviewQueueDedup(
  queues: RedditReviewQueueSnapshot[],
  decided: RedditDecidedTargetRecord[] = []
): RedditQueueDedupPlan {
  const decidedByKey = new Map<string, RedditDecidedTargetRecord>();
  for (const record of decided) {
    for (const key of recordKeys(record.targetKey, record.leadId)) {
      if (!decidedByKey.has(key)) {
        decidedByKey.set(key, record);
      }
    }
  }

  const newestFirst = [...queues].sort((left, right) =>
    queueSortKey(right).localeCompare(queueSortKey(left))
  );

  const supersessions: RedditQueueDedupSupersession[] = [];
  const keptByKey = new Map<string, { queueId: string; leadId: string }>();
  let pendingCount = 0;

  for (const queue of newestFirst) {
    for (const lead of queue.leads) {
      if (!isPending(lead)) {
        continue;
      }
      pendingCount += 1;
      const targetKey = redditLeadTargetKey(lead);
      const keys = recordKeys(targetKey, lead.id);

      const decision = keys.map((key) => decidedByKey.get(key)).find(Boolean);
      if (decision && !(decision.queueId === queue.queueId && decision.leadId === lead.id)) {
        supersessions.push({
          queueId: queue.queueId,
          leadId: lead.id,
          targetKey,
          decidedSource: decision.source,
          reason: `superseded duplicate: target already ${decision.source}${decision.queueId ? ` via queue ${decision.queueId}` : ""}`
        });
        continue;
      }

      const kept = keys.map((key) => keptByKey.get(key)).find(Boolean);
      if (kept) {
        supersessions.push({
          queueId: queue.queueId,
          leadId: lead.id,
          targetKey,
          keptQueueId: kept.queueId,
          keptLeadId: kept.leadId,
          reason: `superseded duplicate: same target pending as ${kept.leadId} in newer queue ${kept.queueId}`
        });
        continue;
      }

      for (const key of keys) {
        keptByKey.set(key, { queueId: queue.queueId, leadId: lead.id });
      }
    }
  }

  return { supersessions, pendingCount };
}

function recordKeys(targetKey: string | undefined, leadId: string | undefined): string[] {
  const keys: string[] = [];
  if (targetKey) {
    keys.push(`target:${targetKey}`);
  }
  if (leadId) {
    keys.push(`lead:${leadId}`);
  }
  return keys;
}

function isPending(lead: RedditLead): boolean {
  return (lead.status ?? "pending") === "pending" && lead.approved !== true;
}

function queueSortKey(queue: RedditReviewQueueSnapshot): string {
  return `${queue.persistedAt ?? ""}|${queue.queueId}`;
}
