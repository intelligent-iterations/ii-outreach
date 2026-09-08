export function normalizeRedditUsername(value: string | undefined): string | undefined {
  const normalized = value?.trim().replace(/^u\//i, "").toLowerCase();
  return normalized || undefined;
}

export function normalizeSubreddit(value: string): string {
  return value.trim().replace(/^r\//i, "");
}

export function selectedSubredditSet(values: string[]): Set<string> {
  return new Set(values.map((value) => normalizeSubreddit(value).toLowerCase()));
}

export function uniqueSubreddits(values: string[]): string[] {
  const result = new Map<string, string>();
  for (const value of values) {
    const subreddit = normalizeSubreddit(value);
    if (subreddit) {
      result.set(subreddit.toLowerCase(), subreddit);
    }
  }
  return [...result.values()];
}

export function optionalText(value: string | undefined): string | undefined {
  const text = value?.trim();
  return text || undefined;
}

export function requiredText(value: string, field: string): string {
  const text = optionalText(value);
  if (!text) {
    throw new Error(`${field} is required`);
  }
  return text;
}

export function positiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

export function validDate(value: Date | string, field: string): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${field} must be a valid date/time`);
  }
  return date;
}

export function dateNumber(value: string): number {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? Number.NEGATIVE_INFINITY : date.getTime();
}
