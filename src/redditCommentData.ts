export function displayRedditCommentData(...values: Array<string | undefined>): string | undefined {
  const value = firstText(...values);
  if (!value || metadataOnlyCommentData(value) || modelSummaryCommentData(value)) {
    return undefined;
  }
  return value.replace(/\s+/g, " ").trim();
}

function metadataOnlyCommentData(value: string): boolean {
  const trimmed = value.trim();
  const normalized = normalizedCommentData(value);
  if (/^source=.*\btopic=/i.test(trimmed)) {
    return true;
  }
  if (normalized === "deleted" || normalized === "removed") {
    return true;
  }
  return normalized.includes("submitted by") && normalized.includes("link") && normalized.includes("comments");
}

function modelSummaryCommentData(value: string): boolean {
  const normalized = normalizedCommentData(value);
  return [
    /^(user|op|poster|author)\s+(asks|asked|says|said|wants|mentions|notes|reports|wonders|is asking|is trying|is worried)\b/,
    /^(the\s+)?(post|thread|comment)\s+(asks|asked|says|said|mentions|notes|reports|discusses|compares|copies|includes|is about)\b/,
    /^discussion\s+(about|around|on)\b/
  ].some((pattern) => pattern.test(normalized));
}

function normalizedCommentData(value: string): string {
  return value
    .toLowerCase()
    .replace(/&[#a-z0-9]+;/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
