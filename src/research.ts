export type RedditResearchStatus = "complete" | "incomplete" | "skipped";

export interface RedditResearchSource {
  title?: string;
  url: string;
  publisher?: string;
  publishedAt?: string;
  accessedAt?: string;
  note?: string;
}

export interface RedditLeadResearchInput {
  status?: string;
  complete?: boolean;
  completedAt?: string;
  completed_at?: string;
  summary?: string;
  queries?: string[];
  searchQueries?: string[];
  search_queries?: string[];
  sources?: Array<string | Partial<RedditResearchSource>>;
  sourceUrls?: string[];
  source_urls?: string[];
  sourceUrl?: string;
  source_url?: string;
}

export interface RedditLeadResearchCarrier {
  research?: RedditLeadResearchInput;
  researchStatus?: string;
  research_status?: string;
  researchSummary?: string;
  research_summary?: string;
  researchQueries?: string[];
  research_queries?: string[];
  researchSources?: Array<string | Partial<RedditResearchSource>>;
  research_sources?: Array<string | Partial<RedditResearchSource>>;
  researchCompletedAt?: string;
  research_completed_at?: string;
  sourceUrl?: string;
  source_url?: string;
}

export interface RedditLeadResearchEvidence {
  status: RedditResearchStatus;
  completedAt?: string;
  summary?: string;
  queries: string[];
  sources: RedditResearchSource[];
}

export function normalizeRedditLeadResearch(input: RedditLeadResearchCarrier): RedditLeadResearchEvidence | undefined {
  const raw = input.research ?? {};
  const summary = firstText(raw.summary, input.researchSummary, input.research_summary);
  const queries = uniqueStrings([
    ...(Array.isArray(raw.queries) ? raw.queries : []),
    ...(Array.isArray(raw.searchQueries) ? raw.searchQueries : []),
    ...(Array.isArray(raw.search_queries) ? raw.search_queries : []),
    ...(Array.isArray(input.researchQueries) ? input.researchQueries : []),
    ...(Array.isArray(input.research_queries) ? input.research_queries : [])
  ]);
  const sources = normalizeResearchSources([
    ...(Array.isArray(raw.sources) ? raw.sources : []),
    ...(Array.isArray(input.researchSources) ? input.researchSources : []),
    ...(Array.isArray(input.research_sources) ? input.research_sources : []),
    ...(Array.isArray(raw.sourceUrls) ? raw.sourceUrls : []),
    ...(Array.isArray(raw.source_urls) ? raw.source_urls : []),
    ...[raw.sourceUrl, raw.source_url, input.sourceUrl, input.source_url].filter((value): value is string => Boolean(value))
  ]);
  const completedAt = firstText(raw.completedAt, raw.completed_at, input.researchCompletedAt, input.research_completed_at);
  const statusText = firstText(raw.status, input.researchStatus, input.research_status)?.toLowerCase();
  const completeByEvidence = Boolean(summary && sources.length > 0);
  const status: RedditResearchStatus = normalizeResearchStatus(statusText, raw.complete === true, completeByEvidence);

  if (!summary && queries.length === 0 && sources.length === 0 && !completedAt && !statusText && raw.complete !== true) {
    return undefined;
  }
  return { status, completedAt, summary, queries, sources };
}

export function validateRedditSuggestedReplyResearch(options: {
  leadId: string;
  proposedReply?: string;
  research?: RedditLeadResearchEvidence;
}): void {
  if (!firstText(options.proposedReply)) {
    return;
  }
  if (!hasCompletedRedditResearchEvidence(options.research)) {
    throw new Error(
      `reddit lead ${options.leadId} suggests a reply but is missing completed web research evidence with a summary and source URL`
    );
  }
}

export function hasCompletedRedditResearchEvidence(research: RedditLeadResearchEvidence | undefined): boolean {
  return Boolean(research?.status === "complete" && firstText(research.summary) && research.sources.length > 0);
}

export function redditResearchEvidenceLines(research: RedditLeadResearchEvidence | undefined): string[] {
  if (!research) {
    return [];
  }
  return compactLines([
    `Status: ${research.status}${research.completedAt ? ` at ${research.completedAt}` : ""}`,
    research.summary ? `Summary: ${research.summary}` : undefined,
    research.queries.length > 0 ? `Queries: ${research.queries.join("; ")}` : undefined,
    ...research.sources.slice(0, 4).map((source, index) => {
      const label = firstText(source.title, source.publisher, `Source ${index + 1}`);
      return `${label}: ${source.url}`;
    })
  ]);
}

function normalizeResearchStatus(
  statusText: string | undefined,
  explicitComplete: boolean,
  completeByEvidence: boolean
): RedditResearchStatus {
  if (statusText === "complete" || statusText === "completed") {
    return "complete";
  }
  if (statusText === "skipped") {
    return "skipped";
  }
  if (statusText) {
    return "incomplete";
  }
  return explicitComplete || completeByEvidence ? "complete" : "incomplete";
}

function normalizeResearchSources(values: Array<string | Partial<RedditResearchSource>>): RedditResearchSource[] {
  const out: RedditResearchSource[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const source = typeof value === "string" ? { url: value } : value;
    const url = firstText(source.url);
    if (!url || !/^https?:\/\//i.test(url) || seen.has(url)) {
      continue;
    }
    seen.add(url);
    out.push({
      url,
      title: firstText(source.title),
      publisher: firstText(source.publisher),
      publishedAt: firstText(source.publishedAt),
      accessedAt: firstText(source.accessedAt),
      note: firstText(source.note)
    });
  }
  return out;
}

function uniqueStrings(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const text = firstText(value);
    if (!text || seen.has(text)) {
      continue;
    }
    seen.add(text);
    out.push(text);
  }
  return out;
}

function compactLines(lines: Array<string | undefined>): string[] {
  return lines.filter((line): line is string => Boolean(line));
}

function firstText(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return undefined;
}
