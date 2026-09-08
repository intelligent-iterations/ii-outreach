import { existsSync, readFileSync } from "node:fs";

const PROMPT_TOKEN = /\{\{([A-Z0-9_]+)\}\}/g;
const PROMPT_SECTION = /\{\{([#^])([A-Z0-9_]+)\}\}([\s\S]*?)\{\{\/\2\}\}/g;
const PROMPT_SECTION_TOKEN = /\{\{[#^\/]([A-Z0-9_]+)\}\}/g;

export function readOutreachPromptTemplate(fileName: string): string {
  const candidates = [
    new URL(`../prompts/${fileName}`, import.meta.url),
    new URL(`../../prompts/${fileName}`, import.meta.url)
  ];
  const templateUrl = candidates.find((candidate) => existsSync(candidate));
  if (!templateUrl) {
    throw new Error(`outreach prompt template is missing: ${fileName}`);
  }
  return readFileSync(templateUrl, "utf8");
}

export function renderOutreachPromptTemplate(
  template: string,
  values: Readonly<Record<string, string | number | boolean>>
): string {
  const required = new Set([
    ...Array.from(template.matchAll(PROMPT_TOKEN), (match) => match[1]),
    ...Array.from(template.matchAll(PROMPT_SECTION_TOKEN), (match) => match[1])
  ]);
  for (const key of required) {
    if (!(key in values)) {
      throw new Error(`outreach prompt template value is missing: ${key}`);
    }
  }
  for (const key of Object.keys(values)) {
    if (!required.has(key)) {
      throw new Error(`outreach prompt template value is unused: ${key}`);
    }
  }
  let rendered = template;
  while (rendered.match(PROMPT_SECTION)) {
    rendered = rendered.replace(
      PROMPT_SECTION,
      (_, mode: string, key: string, body: string) => {
        const value = values[key];
        if (typeof value !== "boolean") {
          throw new Error(`outreach prompt section value must be boolean: ${key}`);
        }
        return mode === "#" ? (value ? body : "") : value ? "" : body;
      }
    );
  }
  rendered = rendered.replace(PROMPT_TOKEN, (_, key: string) => String(values[key]));
  if (rendered.match(PROMPT_TOKEN) || rendered.match(PROMPT_SECTION_TOKEN)) {
    throw new Error("outreach prompt template contains unresolved values");
  }
  return rendered.replace(/\n{3,}/g, "\n\n").trim();
}
