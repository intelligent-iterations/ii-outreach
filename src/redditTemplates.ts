import type { RedditLead } from "./scheduling.js";
import { isAurafarmLead, suggestedContribution } from "./redditProgram.js";

export type RedditTemplateCatalog = Record<string, string[]>;

export interface NormalizeRedditLeadTemplateOptions {
  catalog?: RedditTemplateCatalog;
  preserveSelectedReply?: boolean;
}

export interface FillRedditTemplateOptions {
  sanitizeTemplateVariables?: boolean;
}

const DEFAULT_TEMPLATE = "scanner_app/comment/general_recommendation";
const FORMULA_SEARCH_GOAL = "finding products with a similar ingredient list";
const OPERATOR_REPLACEMENT_TEMPLATE = "scanner_app/comment/operator_replacement";

const TEMPLATE_ALIASES: Record<string, string> = {
  "fixture-tmux-agent-fallback": DEFAULT_TEMPLATE,
  ingredient_list_helper: DEFAULT_TEMPLATE,
  tmux_agent_fallback: DEFAULT_TEMPLATE,
  "tmux-agent-fallback": DEFAULT_TEMPLATE
};

export const DEFAULT_REDDIT_COMMENT_TEMPLATES: RedditTemplateCatalog = {
  "controversial_ingredient/comment/general_recommendation": [
    "Have you tried scanning the actual ingredients list instead of the barcode? I use the pom app for this and you can customize how ingredients get flagged based on research severity.",
    "If you care about what is in your products, the pom app is worth a look. You scan the ingredient list and set your own thresholds for how things get flagged based on the strength of the research.",
    "You might want to check out the pom app. It scans the ingredients list instead of a barcode, so it works with any product, and you can customize flagging based on research quality."
  ],
  "controversial_ingredient/comment/ingredient_question": [
    "Great question about {ingredient}. The pom app is useful for this because it scans the ingredient list and lets you set your own flagging thresholds based on research severity.",
    "I use the pom app for ingredient questions like {ingredient} because it separates research strength, like human studies vs animal or in vitro findings, and lets you decide what matters."
  ],
  "scanner_app/comment/general_recommendation": [
    "Have you tried scanning the actual ingredients list instead of the barcode? I use the pom app for this and you can customize how ingredients get flagged based on research severity.",
    "If you care about what is in your products, the pom app is worth a look. You scan the ingredient list and set your own thresholds for how things get flagged based on the strength of the research.",
    "You might want to check out the pom app. It scans the ingredients list instead of a barcode, so it works with any product, and you can customize flagging based on research quality."
  ],
  "scanner_app/comment/contextual_recommendation": [
    "For {user_goal}, the pom app may be useful because it scans the ingredient list directly and lets you set flagging thresholds based on research severity.",
    "For {user_goal}, the pom app is worth a look because it reads ingredient lists and lets you choose how strict the evidence threshold should be.",
    "For questions about {product_context}, I would use the pom app to scan the ingredient list directly and adjust flags by research strength."
  ],
  "scanner_app/comment/ingredient_question": [
    "Great question about {ingredient}. The pom app is useful for this because it scans the ingredient list and lets you set your own flagging thresholds based on research severity.",
    "I use the pom app for ingredient questions like {ingredient} because it separates research strength, like human studies vs animal or in vitro findings, and lets you decide what matters."
  ],
  "scanner_app/comment/scanner_mention": [
    "I am iffy about {app_mentioned} because it gives everyone the same score regardless of what they care about. I use the pom app because you can set your own severity levels for ingredient flagging.",
    "{app_mentioned} can be useful, but I prefer the pom app when I want the actual ingredient breakdown and control over how strict the evidence threshold is."
  ],
  "scanner_app/comment/operator_replacement": [
    "The pom app gives information on any ingredient you do not recognize and lets you flag it for future reference, so it can be a useful educational tool.",
    "The pom app also allows custom flags and provides research-backed explanations for every ingredient. It scans the ingredient list instead of the barcode, so it still works when formulas change.",
    "Not all ingredients are listed plainly; some are hidden under umbrella terms. The pom app is useful for checking those and helping you decide whether an umbrella term could be hiding something important.",
    "Some ingredient listings can be deceptive, especially for people with allergies. The pom app can help because it looks for umbrella ingredients and flags them so you can catch sneaky ingredients before buying.",
    "The pom app can also show research-backed notes about ingredients that may trigger sensitivities, so you can decide whether something is worth avoiding."
  ],
  "scanner_app/comment/health_topic": [
    "Not medical advice, but tracking labels helped me notice patterns. I use the pom app because it scans ingredient lists and lets you set flagging thresholds based on the strength of the research."
  ]
};

export function normalizeRedditLeadTemplate(
  lead: RedditLead,
  options: NormalizeRedditLeadTemplateOptions = {}
): RedditLead {
  if (isAurafarmLead(lead)) {
    const message = firstText(lead.proposedReply, lead.proposed_reply, lead.message, suggestedContribution(lead));
    return compactLead({
      ...lead,
      program: "aurafarm",
      intent: "helpful",
      strategy: lead.strategy ?? "aurafarm",
      templateName: undefined,
      template_name: undefined,
      message,
      proposedReply: message
    });
  }

  if (options.preserveSelectedReply) {
    const selectedReply = firstText(
      lead.proposedReply,
      lead.proposed_reply,
      lead.message,
    );
    const selectedTemplate = firstText(lead.templateName, lead.template_name);
    if (selectedReply && selectedTemplate) {
      return compactLead({
        ...lead,
        strategy: lead.strategy ?? selectedTemplate.split('/comment/')[0],
        templateName: selectedTemplate,
        template_name: undefined,
        message: selectedReply,
        proposedReply: selectedReply,
      });
    }
  }

  const catalog = { ...DEFAULT_REDDIT_COMMENT_TEMPLATES, ...options.catalog };
  const operatorReplacement = operatorReplacementReply(lead);
  if (operatorReplacement) {
    return compactLead({
      ...lead,
      strategy: lead.strategy ?? "scanner_app",
      templateName: OPERATOR_REPLACEMENT_TEMPLATE,
      template_name: undefined,
      message: operatorReplacement,
      proposedReply: operatorReplacement
    });
  }
  const selected = selectedRenderedTemplate(lead, catalog);
  if (selected) {
    return compactLead({
      ...lead,
      strategy: lead.strategy ?? selected.templateName.split("/comment/")[0],
      templateName: selected.templateName,
      template_name: undefined,
      message: selected.message,
      proposedReply: selected.message
    });
  }

  const templateName = resolveTemplateName(lead, catalog);
  const templates = catalog[templateName] ?? catalog[DEFAULT_TEMPLATE];
  const template = chooseTemplate(templates, lead);
  const message = fillRedditTemplate(template, lead);
  return compactLead({
    ...lead,
    strategy: lead.strategy ?? templateName.split("/comment/")[0],
    templateName,
    template_name: undefined,
    message,
    proposedReply: message
  });
}

export function normalizeRedditLeadTemplates(
  leads: RedditLead[],
  options: NormalizeRedditLeadTemplateOptions = {}
): RedditLead[] {
  return leads.map((lead) => normalizeRedditLeadTemplate(lead, options));
}

export function flattenRedditTemplateConfig(value: unknown): RedditTemplateCatalog {
  const out: RedditTemplateCatalog = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return out;
  }
  for (const [strategy, strategyConfig] of Object.entries(value)) {
    const commentTemplates = (strategyConfig as { comment_templates?: unknown }).comment_templates;
    if (!commentTemplates || typeof commentTemplates !== "object" || Array.isArray(commentTemplates)) {
      continue;
    }
    for (const [key, templates] of Object.entries(commentTemplates)) {
      if (Array.isArray(templates)) {
        const clean = templates.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
        if (clean.length > 0) {
          out[`${strategy}/comment/${key}`] = clean;
        }
      }
    }
  }
  return out;
}

export function fillRedditTemplate(
  template: string,
  lead: RedditLead,
  options: FillRedditTemplateOptions = {}
): string {
  const keyword = firstText(lead.keyword) ?? "ingredient list";
  const context: Record<string, string> = {
    app_mentioned: mentionedApp(lead) ?? "ingredient scanner",
    ingredient: keyword,
    keyword,
    post_or_comment: firstText(lead.action, lead.actionType, lead.action_type) ?? "post",
    subreddit: firstText(lead.subreddit) ?? "",
    topic: firstText(lead.threadTitle, lead.thread_title, lead.title, keyword) ?? keyword,
    user_goal: userGoal(lead) ?? keyword,
    product_context: productContext(lead) ?? keyword,
    username: normalizeUsername(firstText(lead.username) ?? "") || "there"
  };
  const variables = cleanTemplateVariables(lead.templateVariables, {
    sanitize: options.sanitizeTemplateVariables !== false
  });
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key: string) => variables[key] ?? context[key] ?? "");
}

function selectedRenderedTemplate(
  lead: RedditLead,
  catalog: RedditTemplateCatalog
): { templateName: string; message: string } | undefined {
  const selectedReply = firstText(lead.proposedReply, lead.message);
  if (!selectedReply) {
    return undefined;
  }

  for (const templateName of orderedTemplateNames(lead, catalog)) {
    for (const template of catalog[templateName] ?? []) {
      const message = fillRedditTemplate(template, lead);
      const unsanitizedMessage = fillRedditTemplate(template, lead, { sanitizeTemplateVariables: false });
      if (sameReply(message, selectedReply) || sameReply(unsanitizedMessage, selectedReply)) {
        return { templateName, message };
      }
    }
  }
  return undefined;
}

function operatorReplacementReply(lead: RedditLead): string | undefined {
  const templateName = firstText(lead.templateName, lead.template_name);
  if (templateName !== OPERATOR_REPLACEMENT_TEMPLATE) {
    return undefined;
  }
  return firstText(lead.proposedReply, lead.message)?.replace(/\s+/g, " ").trim();
}

function orderedTemplateNames(lead: RedditLead, catalog: RedditTemplateCatalog): string[] {
  const requested = firstText(lead.templateName, lead.template_name);
  const aliased = requested ? TEMPLATE_ALIASES[requested] ?? requested : undefined;
  return [
    aliased,
    ...Object.keys(catalog)
  ].filter((name, index, names): name is string => Boolean(name && catalog[name]) && names.indexOf(name) === index);
}

function resolveTemplateName(lead: RedditLead, catalog: RedditTemplateCatalog): string {
  const requested = firstText(lead.templateName, lead.template_name);
  const aliased = requested ? TEMPLATE_ALIASES[requested] ?? requested : undefined;
  if (aliased && catalog[aliased]) {
    return aliased;
  }
  if (ingredientQuestion(lead) && catalog["scanner_app/comment/ingredient_question"]) {
    return "scanner_app/comment/ingredient_question";
  }
  if (mentionedApp(lead) && catalog["scanner_app/comment/scanner_mention"]) {
    return "scanner_app/comment/scanner_mention";
  }
  if (catalog["scanner_app/comment/contextual_recommendation"]) {
    return "scanner_app/comment/contextual_recommendation";
  }
  return DEFAULT_TEMPLATE;
}

function chooseTemplate(templates: string[] | undefined, lead: RedditLead): string {
  const choices = templates && templates.length > 0 ? templates : DEFAULT_REDDIT_COMMENT_TEMPLATES[DEFAULT_TEMPLATE];
  const seed = `${lead.id}:${lead.commentLink ?? lead.permalink ?? lead.url ?? ""}`;
  return choices[hashString(seed) % choices.length];
}

function ingredientQuestion(lead: RedditLead): boolean {
  const text = normalizeForMatch([
    lead.keyword,
    lead.title,
    lead.threadTitle,
    lead.thread_title,
    lead.commentData,
    lead.targetText,
    lead.target_text,
    lead.lead?.comment_text
  ].filter(Boolean).join(" "));
  return [
    "ingredient question",
    "ingredients list",
    "ingredient list",
    "product ingredients",
    "what ingredients",
    "checking ingredients"
  ].some((term) => text.includes(term));
}

function mentionedApp(lead: RedditLead): string | undefined {
  const text = normalizeForMatch([
    lead.keyword,
    lead.title,
    lead.threadTitle,
    lead.thread_title,
    lead.commentData,
    lead.targetText,
    lead.target_text
  ].filter(Boolean).join(" "));
  const apps: Array<[string, string]> = [
    ["yuka", "Yuka"],
    ["ewg", "EWG"],
    ["think dirty", "Think Dirty"],
    ["onskin", "OnSkin"],
    ["incidecoder", "INCIdecoder"]
  ];
  return apps.find(([needle]) => text.includes(needle))?.[1];
}

function userGoal(lead: RedditLead): string | undefined {
  return conciseContext(
    firstText(
      cleanQuestionLeadIn(lead.commentData),
      cleanQuestionLeadIn(lead.targetText),
      cleanQuestionLeadIn(lead.target_text),
      lead.keyword
    )
  );
}

function productContext(lead: RedditLead): string | undefined {
  const title = firstText(lead.threadTitle, lead.thread_title, lead.title);
  const keyword = firstText(lead.keyword);
  return conciseContext(title && keyword ? `${keyword} / ${title}` : title ?? keyword);
}

function cleanQuestionLeadIn(value: string | undefined): string | undefined {
  const trimmed = value?.replace(/\s+/g, " ").trim();
  if (!trimmed) {
    return undefined;
  }
  const formulaGoal = formulaSearchGoal(trimmed);
  if (formulaGoal) {
    return formulaGoal;
  }
  return trimmed
    .replace(/^OP asks whether people /i, "figuring out whether people ")
    .replace(/^Genuine question:\s*/i, "")
    .replace(/^Maybe a dumb question but\s*/i, "")
    .replace(/^I(?:'|\u2019)ve been /i, "finding ways to ")
    .trim();
}

function conciseContext(value: string | undefined): string | undefined {
  const trimmed = value?.replace(/\s+/g, " ").trim();
  if (!trimmed) {
    return undefined;
  }
  const withoutUrl = trimmed.replace(/https?:\/\/\S+/gi, "").trim();
  const words = withoutUrl.split(/\s+/).slice(0, 16).join(" ");
  return words.replace(/[.?!,:;]+$/g, "").trim() || undefined;
}

function sameReply(left: string, right: string): boolean {
  return normalizeReply(left) === normalizeReply(right);
}

function normalizeReply(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeUsername(value: string): string {
  return value.replace(/^u\//i, "").trim();
}

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
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

function cleanTemplateVariables(
  value: Record<string, string> | undefined,
  options: { sanitize: boolean } = { sanitize: true }
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value ?? {})) {
    const trimmed = options.sanitize
      ? normalizeTemplateVariable(key, typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "")
      : typeof raw === "string"
        ? raw.replace(/\s+/g, " ").trim()
        : "";
    if (/^[a-zA-Z0-9_]+$/.test(key) && trimmed) {
      out[key] = trimmed;
    }
  }
  return out;
}

function normalizeTemplateVariable(key: string, value: string): string {
  if (key === "product_context") {
    return value
      .replace(/\s+\/\s+.*$/g, "")
      .replace(/\bquestion$/i, "")
      .replace(/\s+/g, " ")
      .trim();
  }
  if (key !== "user_goal") {
    return value;
  }
  return normalizeQuestionTitleGoal(value)
    .replace(/^(?:User|OP|poster)\s+asks\s+what\b/i, "figure out what")
    .replace(/^(?:User|OP|poster)\s+asks\s+how\b/i, "figure out how")
    .replace(/^(?:User|OP|poster)\s+asks\s+whether\b/i, "decide whether")
    .replace(/^(?:User|OP|poster)\s+asks\s+if\b/i, "decide if")
    .replace(/^(?:User|OP|poster)\s+asks\s+which\b/i, "choose which")
    .replace(/^(?:User|OP|poster)\s+wants\s+to\b/i, "")
    .replace(/^(?:User|OP|poster)\s+is\s+(?:asking|trying)\s+to\b/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeQuestionTitleGoal(value: string): string {
  const withoutUrl = value.replace(/https?:\/\/\S+/gi, "").trim();
  const formulaGoal = formulaSearchGoal(withoutUrl);
  if (formulaGoal) {
    return formulaGoal;
  }
  const beforeQuestionDetail = withoutUrl.includes("?")
    ? `${withoutUrl.split("?")[0]?.trim() ?? ""}?`
    : withoutUrl;
  const withoutDanglingParenthetical = beforeQuestionDetail.replace(/\s*\([^)]*$/g, "").trim();
  if (/^which brands do you trust\??$/i.test(withoutDanglingParenthetical)) {
    return "choosing reputable brands";
  }
  if (/^which brands\b/i.test(withoutDanglingParenthetical)) {
    return "choosing reputable brands";
  }
  if (/^how (?:can|do) i\b/i.test(withoutDanglingParenthetical)) {
    return withoutDanglingParenthetical
      .replace(/^how (?:can|do) i\s+/i, "figuring out how to ")
      .replace(/[?]+$/g, "")
      .trim();
  }
  return withoutDanglingParenthetical;
}

function formulaSearchGoal(value: string): string | undefined {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return undefined;
  }
  if (/^(?:i(?:'|\u2019)m|i am|im)\s+looking for something formulated like this\b/i.test(normalized)) {
    return FORMULA_SEARCH_GOAL;
  }
  if (/^looking for something formulated like this\b/i.test(normalized)) {
    return FORMULA_SEARCH_GOAL;
  }
  if (/\bformulated like this\s*:/i.test(normalized) && likelyIngredientList(normalized)) {
    return FORMULA_SEARCH_GOAL;
  }
  if (/^(?:water|aqua)\s*,/i.test(normalized) && likelyIngredientList(normalized)) {
    return FORMULA_SEARCH_GOAL;
  }
  return undefined;
}

function likelyIngredientList(value: string): boolean {
  if ((value.match(/,/g) ?? []).length < 3) {
    return false;
  }
  const text = normalizeForMatch(value);
  return [
    "water",
    "aqua",
    "dimethicone",
    "cyclopentasiloxane",
    "isododecane",
    "butylene glycol",
    "acrylates",
    "tocopherol"
  ].some((term) => text.includes(term));
}

function compactLead(lead: RedditLead): RedditLead {
  return Object.fromEntries(Object.entries(lead).filter(([, value]) => value !== undefined)) as RedditLead;
}
