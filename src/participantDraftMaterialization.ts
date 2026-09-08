import {
  PARTICIPANT_DRAFT_MAX_COMMUNITY_WORDS,
  PARTICIPANT_DRAFT_MAX_RANKED_ALIASES,
  PARTICIPANT_DRAFT_MAX_WORD_CHANGES,
  participantDraftAliasRef,
  participantDraftCandidateRef,
  participantDraftModeForCandidate,
  type ParticipantDraftBatch,
  type ParticipantDraftEditOperation,
  type ParticipantDraftInput,
  type ParticipantMessageDraft
} from "./participantDrafts.js";

interface AgentEdit {
  operation: ParticipantDraftEditOperation;
  index: number;
  value: string;
}

interface AgentDraft {
  candidateRef: string;
  selectedAliasRef: string;
  rankedAliasRefs: string[];
  edits: AgentEdit[];
  tailoredMessage: string;
  reason: string;
}

export function materializeParticipantDraftBatch(
  value: unknown,
  input: ParticipantDraftInput
): ParticipantDraftBatch {
  const root = record(value, "participant draft output");
  if (!Array.isArray(root.drafts) || root.drafts.length !== input.candidates.length) {
    throw new Error("participant draft output must cover every candidate exactly once");
  }
  const candidateByRef = new Map(
    input.candidates.map((candidate, index) => [participantDraftCandidateRef(index), candidate])
  );
  const aliasByRef = new Map(
    input.aliases.map((alias, index) => [participantDraftAliasRef(index), alias])
  );
  const seen = new Set<string>();
  const drafts = root.drafts.map((raw, index) => {
    const draft = validateAgentDraft(raw, index);
    const candidate = candidateByRef.get(draft.candidateRef);
    if (!candidate || !seen.add(draft.candidateRef)) {
      throw new Error(`participant draft candidate reference is unknown or duplicated: ${draft.candidateRef}`);
    }
    const selectedAlias = aliasByRef.get(draft.selectedAliasRef);
    if (!selectedAlias) {
      throw new Error(`participant draft selected an unknown alias: ${draft.selectedAliasRef}`);
    }
    const rankedAliases = draft.rankedAliasRefs.map((aliasRef) => aliasByRef.get(aliasRef));
    if (
      rankedAliases.some((alias) => !alias) ||
      new Set(draft.rankedAliasRefs).size !== draft.rankedAliasRefs.length ||
      draft.rankedAliasRefs[0] !== draft.selectedAliasRef
    ) {
      throw new Error(`participant draft ${draft.candidateRef} has an invalid alias ranking`);
    }
    const draftMode = participantDraftModeForCandidate(input.draftMode, candidate.intentMode);
    const message = materializeMessage({
      draft,
      draftMode,
      aliasMessage: selectedAlias.message,
      maxWordChanges: input.maxWordChanges,
      productName: input.campaign.productName,
      intentMode: candidate.intentMode
    });
    return {
      leadId: candidate.leadId,
      status: "draft",
      intentMode: candidate.intentMode,
      draftMode,
      selectedMessageId: selectedAlias.messageId,
      rankedMessageIds: rankedAliases.map((alias) => alias!.messageId),
      message,
      commentOpener: "",
      editCount: draftMode === "new"
        ? null
        : participantDraftWordChanges(selectedAlias.message, message),
      reason: draft.reason,
      researchEvidence: [{ title: "Exact Reddit source", url: candidate.sourceUrl }]
    } satisfies ParticipantMessageDraft;
  });
  if (seen.size !== input.candidates.length) {
    throw new Error("participant draft output omitted a candidate");
  }
  return { drafts };
}

function materializeMessage(options: {
  draft: AgentDraft;
  draftMode: "exact" | "adapt" | "new";
  aliasMessage: string;
  maxWordChanges: number;
  productName: string;
  intentMode: "high_intent" | "community_assumed_intent";
}): string {
  const label = `${options.intentMode.replaceAll("_", "-")} draft ${options.draft.candidateRef}`;
  if (options.draftMode === "exact") {
    if (options.draft.edits.length !== 0 || options.draft.tailoredMessage) {
      throw new Error(`${label} must use the selected example exactly`);
    }
    requireHumanPunctuation(options.aliasMessage, label);
    return options.aliasMessage;
  }
  if (options.draftMode === "adapt") {
    return materializeAdaptedMessage(
      options.draft,
      options.aliasMessage,
      options.maxWordChanges,
      label
    );
  }
  return validateNewMessage(
    options.draft,
    options.aliasMessage,
    options.productName,
    label
  );
}

function validateAgentDraft(value: unknown, index: number): AgentDraft {
  const draft = record(value, `participant draft ${index + 1}`);
  const candidateRef = requiredText(draft.candidateRef, "candidateRef", 20);
  const selectedAliasRef = requiredText(draft.selectedAliasRef, "selectedAliasRef", 20);
  const rankedAliasRefs = stringList(
    draft.rankedAliasRefs,
    "rankedAliasRefs",
    1,
    PARTICIPANT_DRAFT_MAX_RANKED_ALIASES,
    20
  );
  if (!Array.isArray(draft.edits) || draft.edits.length > PARTICIPANT_DRAFT_MAX_WORD_CHANGES) {
    throw new Error(`participant draft ${candidateRef} has more than three structured token edits`);
  }
  const edits = draft.edits.map((raw) => {
    const edit = record(raw, "participant draft edit");
    const operation = requiredText(edit.operation, "edit.operation", 12);
    if (!(["insert", "replace", "delete"] as string[]).includes(operation)) {
      throw new Error(`participant draft ${candidateRef} has an invalid edit operation`);
    }
    if (!Number.isSafeInteger(edit.index) || (edit.index as number) < 0) {
      throw new Error(`participant draft ${candidateRef} has an invalid edit index`);
    }
    const value = optionalText(edit.value, "edit.value", 160);
    if (operation !== "delete" && (!value || /\s/u.test(value))) {
      throw new Error(`participant draft ${candidateRef} edit values must be one token`);
    }
    if (operation === "delete" && value) {
      throw new Error(`participant draft ${candidateRef} delete edits must use an empty value`);
    }
    return { operation, index: edit.index as number, value } as AgentEdit;
  });
  return {
    candidateRef,
    selectedAliasRef,
    rankedAliasRefs,
    edits,
    tailoredMessage: optionalText(draft.tailoredMessage, "tailoredMessage", 1000),
    reason: requiredText(draft.reason, "reason", 300)
  };
}

function materializeAdaptedMessage(
  draft: AgentDraft,
  aliasMessage: string,
  maxWordChanges: number,
  label: string
): string {
  if (draft.tailoredMessage) {
    throw new Error(`${label} must use structured token edits`);
  }
  const tokens = words(aliasMessage);
  const indexes = new Set<number>();
  for (const edit of draft.edits) {
    if (!indexes.add(edit.index)) {
      throw new Error(`${label} repeats an edit index`);
    }
    const maximum = edit.operation === "insert" ? tokens.length : tokens.length - 1;
    if (edit.index > maximum) {
      throw new Error(`${label} has an out-of-range edit index`);
    }
  }
  const edited = [...tokens];
  for (const edit of [...draft.edits].sort((left, right) => right.index - left.index)) {
    if (edit.operation === "insert") edited.splice(edit.index, 0, edit.value);
    if (edit.operation === "replace") {
      edited.splice(
        edit.index,
        1,
        preserveTrailingPunctuation(edited[edit.index]!, edit.value)
      );
    }
    if (edit.operation === "delete") edited.splice(edit.index, 1);
  }
  const message = edited.join(" ");
  if (!message || participantDraftWordChanges(aliasMessage, message) > maxWordChanges) {
    throw new Error(`${label} exceeds the ${maxWordChanges}-word edit limit`);
  }
  requireHumanPunctuation(message, label);
  return message;
}

function preserveTrailingPunctuation(sourceToken: string, replacement: string): string {
  const punctuation = sourceToken.match(/[.,!?;:]+$/u)?.[0] ?? "";
  return punctuation && !/[.,!?;:]$/u.test(replacement)
    ? `${replacement}${punctuation}`
    : replacement;
}

function validateNewMessage(
  draft: AgentDraft,
  aliasMessage: string,
  productName: string,
  label: string
): string {
  if (draft.edits.length !== 0) {
    throw new Error(`${label} must use a new message, not token edits`);
  }
  const message = draft.tailoredMessage.trim();
  if (participantDraftWordChanges(aliasMessage, message) <= PARTICIPANT_DRAFT_MAX_WORD_CHANGES) {
    throw new Error(`${label} must be newly written, not an exact or lightly edited example`);
  }
  const count = words(message).length;
  if (count < 8 || count > PARTICIPANT_DRAFT_MAX_COMMUNITY_WORDS) {
    throw new Error(
      `${label} must contain 8 to ${PARTICIPANT_DRAFT_MAX_COMMUNITY_WORDS} words`
    );
  }
  if (!containsProductName(message, productName)) {
    throw new Error(`${label} must mention the campaign product name`);
  }
  if (!/\b(?:send|share)\b[^.!?\n]{0,48}\blink\b/iu.test(message)) {
    throw new Error(`${label} must offer to send the link`);
  }
  if (/https?:\/\/|www\./iu.test(message)) {
    throw new Error(`${label} must offer a link without including one`);
  }
  requireHumanPunctuation(message, label);
  return message;
}

function containsProductName(message: string, productName: string): boolean {
  const escaped = productName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(^|[^A-Za-z0-9_])${escaped}(?=$|[^A-Za-z0-9_])`, "u").test(message);
}

function requireHumanPunctuation(message: string, name: string): void {
  if (/[\u2014\u2013]|\s-\s/u.test(message)) {
    throw new Error(`${name} must not contain an em dash or spaced-hyphen clause separator`);
  }
}

export function participantDraftWordChanges(source: string, draft: string): number {
  const left = words(source);
  const right = words(draft);
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = Array<number>(right.length + 1).fill(0);
    current[0] = row;
    for (let column = 1; column <= right.length; column += 1) {
      current[column] = Math.min(
        previous[column] + 1,
        current[column - 1] + 1,
        previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1)
      );
    }
    previous = current;
  }
  return previous.at(-1) ?? 0;
}

function words(value: string): string[] {
  return value.trim().split(/\s+/u).filter(Boolean);
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, name: string, maxLength: number): string {
  if (typeof value !== "string" || value.trim().length < 1 || value.trim().length > maxLength) {
    throw new Error(`${name} must be non-empty and at most ${maxLength} characters`);
  }
  return value.trim();
}

function optionalText(value: unknown, name: string, maxLength: number): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string" || value.trim().length > maxLength) {
    throw new Error(`${name} must be a string with at most ${maxLength} characters`);
  }
  return value.trim();
}

function stringList(
  value: unknown,
  name: string,
  min: number,
  max: number,
  maxLength: number
): string[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new Error(`${name} must contain ${min} to ${max} values`);
  }
  return value.map((item) => requiredText(item, name, maxLength));
}
