"""
Grok triage module for lead evaluation and template selection.

This version is product-agnostic. Prompt files can reference runtime
product fields with {{TOKEN}} placeholders, which are populated from config.json.
"""

import json
import os
import re
from typing import Optional

from openai import OpenAI

from src.runtime.models import TriageDecision, TriageResult, DiscoveryResult
from src.decision.templates import detect_archetype, prepare_template_selection
from src.shared.project_paths import PROJECT_DIR as BASE_DIR, REPO_DIR
from src.shared.utils import log


def _load_prompt_file(filename: str) -> str:
    path = os.path.join(BASE_DIR, filename)
    if not os.path.exists(path):
        path = os.path.join(REPO_DIR, filename)
    with open(path, "r") as f:
        text = f.read()

    try:
        with open(os.path.join(BASE_DIR, "config.json"), "r") as cfg:
            config = json.load(cfg)
    except Exception:
        config = {}

    product = config.get("product", {})
    replacements = {
        "{{PRODUCT_NAME}}": product.get("name", "your product"),
        "{{PRODUCT_SUMMARY}}": product.get("summary", "a useful product"),
        "{{TARGET_AUDIENCE}}": product.get("target_audience", "the right users"),
        "{{PRODUCT_URL}}": product.get("url", ""),
        "{{RESEARCH_URL}}": product.get("research_url", ""),
        "{{VALUE_PROPS}}": "; ".join(product.get("value_props", [])) or product.get("summary", ""),
        "{{COMPETITORS}}": ", ".join(product.get("competitors", [])),
        "{{VOICE_NOTES}}": product.get("voice_notes", "helpful, concise, low-pressure"),
    }
    for token, value in replacements.items():
        text = text.replace(token, str(value))
    return text


def _get_client(grok_config: dict) -> OpenAI:
    api_key = os.getenv("XAI_API_KEY")
    if not api_key:
        raise RuntimeError("XAI_API_KEY not set in environment")
    return OpenAI(
        api_key=api_key,
        base_url=grok_config.get("base_url", "https://api.x.ai/v1"),
    )


def build_triage_prompt(
    leads: list[dict],
    strategy_config: dict,
    strategy_templates: dict,
) -> tuple[str, str]:
    """Build system + user prompt for Grok triage."""

    # System prompt = base + strategy-specific
    base_prompt = _load_prompt_file("prompts/base_system.txt")
    strategy_prompt = _load_prompt_file(strategy_config["prompt_file"])
    system_prompt = base_prompt + "\n\n" + strategy_prompt

    # User prompt = templates + leads
    parts = ["## Available Templates\n"]

    # Comment templates
    comment_templates = strategy_templates.get("comment_templates", {})
    if comment_templates:
        parts.append("### Comment Templates")
        for name, variations in comment_templates.items():
            parts.append(f"\n**{name}** ({len(variations)} variations):")
            for i, v in enumerate(variations):
                parts.append(f"  [{i}]: {v}")

    # DM templates
    dm_templates = strategy_templates.get("dm_templates", {})
    if dm_templates:
        parts.append("\n### DM Templates")
        for name, variations in dm_templates.items():
            parts.append(f"\n**{name}** ({len(variations)} variations):")
            for i, v in enumerate(variations):
                parts.append(f"  [{i}]: {v}")

    # DM subjects
    dm_subjects = strategy_templates.get("dm_subjects", {})
    if dm_subjects:
        parts.append("\n### DM Subject Lines")
        for name, subject in dm_subjects.items():
            parts.append(f"  {name}: {subject}")

    # Leads
    parts.append("\n\n## Leads to Triage\n")
    leads_for_prompt = []
    for i, lead in enumerate(leads):
        leads_for_prompt.append({
            "index": i,
            "username": lead.get("username", ""),
            "subreddit": lead.get("subreddit", ""),
            "permalink": lead.get("permalink", ""),
            "comment_text": lead.get("comment_text", "")[:200],
            "post_title": lead.get("post_title", "")[:100],
            "keyword_matched": lead.get("keyword_matched", ""),
            "post_age": lead.get("post_age", ""),
            "source": lead.get("source", ""),
        })
    parts.append(json.dumps(leads_for_prompt, indent=2))

    user_prompt = "\n".join(parts)
    return system_prompt, user_prompt


def _call_grok(
    system_prompt: str,
    user_prompt: str,
    grok_config: dict,
) -> tuple[str, dict]:
    """Call Grok 4 API. Returns (response_text, usage_dict)."""
    client = _get_client(grok_config)

    response = client.chat.completions.create(
        model=grok_config.get("model", "grok-4"),
        temperature=grok_config.get("temperature", 0.3),
        max_tokens=grok_config.get("max_tokens", 8192),
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    )

    text = response.choices[0].message.content or ""
    usage = {}
    if response.usage:
        usage = {
            "prompt_tokens": response.usage.prompt_tokens,
            "completion_tokens": response.usage.completion_tokens,
            "total_tokens": response.usage.total_tokens,
        }

    return text, usage


def _strip_code_fences(text: str) -> str:
    """Strip markdown code fences from JSON response."""
    text = text.strip()
    if text.startswith("```"):
        # Remove opening fence (with optional language tag)
        text = re.sub(r'^```\w*\n?', '', text)
    if text.endswith("```"):
        text = text[:-3]
    return text.strip()


def _validate_decision(
    data: dict,
    leads: list[dict],
    strategy_templates: dict,
    allowed_actions: list[str],
) -> TriageDecision | None:
    """Validate a single triage decision. Returns None if invalid."""
    # Required fields
    for field in ["lead_index", "action_type", "template_name"]:
        if field not in data:
            print(f"[TRIAGE] Invalid decision: missing {field}")
            return None

    lead_index = data["lead_index"]
    if not (0 <= lead_index < len(leads)):
        print(f"[TRIAGE] Invalid lead_index: {lead_index}")
        return None

    action_type = data["action_type"]
    if action_type not in allowed_actions:
        print(f"[TRIAGE] Action '{action_type}' not allowed for this strategy")
        return None

    template_name = data["template_name"]
    template_key = "dm_templates" if action_type == "dm" else "comment_templates"
    template_list = strategy_templates.get(template_key, {}).get(template_name, [])
    if not template_list:
        print(f"[TRIAGE] Unknown template: {template_key}.{template_name}")
        return None

    variation = data.get("template_variation", 0)
    if not (0 <= variation < len(template_list)):
        print(f"[TRIAGE] Invalid variation {variation} for {template_name} (has {len(template_list)})")
        return None

    # Check placeholders cover all template slots
    template_text = template_list[variation]
    required_placeholders = set(re.findall(r'\{(\w+)\}', template_text))
    provided = set(data.get("placeholders", {}).keys())
    missing = required_placeholders - provided
    if missing:
        print(f"[TRIAGE] Missing placeholders for lead {lead_index}: {missing}")
        return None

    return TriageDecision.from_dict(data)


def parse_triage_response(
    raw_response: str,
    leads: list[dict],
    strategy_templates: dict,
    allowed_actions: list[str],
) -> TriageResult:
    """Parse and validate Grok's JSON response."""
    result = TriageResult(raw_response=raw_response)

    cleaned = _strip_code_fences(raw_response)
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as e:
        print(f"[TRIAGE] Failed to parse JSON: {e}")
        return result

    seen_indices = set()

    for item in parsed.get("approved", []):
        idx = item.get("lead_index")
        if idx in seen_indices:
            print(f"[TRIAGE] Duplicate lead_index: {idx}, skipping")
            continue

        decision = _validate_decision(item, leads, strategy_templates, allowed_actions)
        if decision:
            result.approved.append(decision)
            seen_indices.add(idx)

    for item in parsed.get("denied", []):
        idx = item.get("lead_index")
        if idx in seen_indices:
            continue
        result.denied.append(item)
        seen_indices.add(idx)

    return result


def triage_leads(
    leads: list[dict],
    strategy_config: dict,
    strategy_templates: dict,
    grok_config: dict,
) -> TriageResult:
    """Main entry point: build prompt, call Grok, parse and validate."""
    if not leads:
        return TriageResult()

    # Limit leads to prevent token overflow (each lead generates ~200 output tokens)
    max_leads = grok_config.get("max_leads_per_batch", 40)
    if len(leads) > max_leads:
        print(f"[TRIAGE] Limiting to first {max_leads} leads (had {len(leads)})")
        leads = leads[:max_leads]

    allowed_actions = strategy_config.get("allowed_actions", ["comment"])
    strategy_name = strategy_config.get("templates_key", "unknown")

    # Build prompt
    system_prompt, user_prompt = build_triage_prompt(
        leads, strategy_config, strategy_templates
    )

    print(f"[TRIAGE] Sending {len(leads)} leads to Grok for '{strategy_name}' strategy...")

    # Call Grok
    max_retries = grok_config.get("max_retries", 2)
    raw_response = ""
    usage = {}

    for attempt in range(max_retries):
        try:
            raw_response, usage = _call_grok(system_prompt, user_prompt, grok_config)
            break
        except Exception as e:
            print(f"[TRIAGE] Grok API error (attempt {attempt + 1}/{max_retries}): {e}")
            if attempt == max_retries - 1:
                print("[TRIAGE] All retries exhausted, returning empty result")
                return TriageResult(raw_response=str(e))

    # Parse and validate
    result = parse_triage_response(raw_response, leads, strategy_templates, allowed_actions)
    result.model = grok_config.get("model", "grok-4")
    result.usage = usage

    print(f"[TRIAGE] Result: {len(result.approved)} approved, {len(result.denied)} denied")
    return result


# ============================================================================
# V2 CONTEXT-AWARE TRIAGE
# ============================================================================


def build_triage_prompt_v2(
    leads: list[dict],
    strategy_config: dict,
    strategy_templates: dict,
) -> tuple[str, str]:
    """
    Build context-aware triage prompt (V2).

    Includes parent comment, thread title, and archetype guidance.
    """
    # System prompt = new v2 prompt + strategy-specific
    system_prompt = _load_prompt_file("prompts/triage_v2.txt")
    strategy_prompt = _load_prompt_file(strategy_config["prompt_file"])
    system_prompt = system_prompt + "\n\n## Strategy-Specific Guidance\n" + strategy_prompt

    # User prompt = templates + leads with context
    parts = ["## Available Templates\n"]

    # Comment templates
    comment_templates = strategy_templates.get("comment_templates", {})
    if comment_templates:
        parts.append("### Comment Templates")
        for name, variations in comment_templates.items():
            parts.append(f"\n**{name}** ({len(variations)} variations):")
            for i, v in enumerate(variations):
                parts.append(f"  [{i}]: {v}")

    # DM templates
    dm_templates = strategy_templates.get("dm_templates", {})
    if dm_templates:
        parts.append("\n### DM Templates")
        for name, variations in dm_templates.items():
            parts.append(f"\n**{name}** ({len(variations)} variations):")
            for i, v in enumerate(variations):
                parts.append(f"  [{i}]: {v}")

    # DM subjects
    dm_subjects = strategy_templates.get("dm_subjects", {})
    if dm_subjects:
        parts.append("\n### DM Subject Lines")
        for name, subject in dm_subjects.items():
            parts.append(f"  {name}: {subject}")

    # Leads with FULL CONTEXT
    parts.append("\n\n## Leads to Triage (with full context)\n")
    leads_for_prompt = []
    for i, lead in enumerate(leads):
        lead_data = {
            "index": i,
            "username": lead.get("username", ""),
            "subreddit": lead.get("subreddit", ""),
            "permalink": lead.get("permalink", ""),
            "keyword_matched": lead.get("keyword_matched", ""),
            "keyword_confirmed_in_comment": lead.get("keyword_confirmed", False),
            "source": lead.get("source", ""),
            # Context fields
            "target_comment": lead.get("full_comment_body", lead.get("comment_text", ""))[:400],
            "parent_comment": lead.get("parent_body", "")[:300],
            "parent_author": lead.get("parent_author", ""),
            "thread_title": lead.get("thread_title", lead.get("post_title", ""))[:150],
            "is_top_level": lead.get("is_top_level", True),
        }
        leads_for_prompt.append(lead_data)

    parts.append(json.dumps(leads_for_prompt, indent=2))

    user_prompt = "\n".join(parts)
    return system_prompt, user_prompt


def build_discovery_prompt(leads: list[dict]) -> tuple[str, str]:
    """
    Build prompt for discovering relevant leads from "maybe" pile.

    These are leads where keyword wasn't confirmed in comment text.
    """
    system_prompt = _load_prompt_file("prompts/discovery.txt")

    parts = ["## Maybe Leads (keyword not confirmed in comment)\n"]
    leads_for_prompt = []
    for i, lead in enumerate(leads):
        leads_for_prompt.append({
            "index": i,
            "username": lead.get("username", ""),
            "subreddit": lead.get("subreddit", ""),
            "comment_text": lead.get("comment_text", "")[:300],
            "thread_title": lead.get("thread_title", lead.get("post_title", ""))[:100],
            "keyword_matched": lead.get("keyword_matched", ""),
        })

    parts.append(json.dumps(leads_for_prompt, indent=2))
    user_prompt = "\n".join(parts)

    return system_prompt, user_prompt


def discover_relevant_leads(
    maybe_leads: list[dict],
    grok_config: dict,
) -> DiscoveryResult:
    """
    Phase 1: Discovery - find relevant leads from the "maybe" pile.

    Returns DiscoveryResult with full logging data.
    """
    if not maybe_leads:
        return DiscoveryResult()

    # Limit batch size
    max_leads = grok_config.get("max_leads_per_batch", 50)
    input_leads = maybe_leads
    if len(maybe_leads) > max_leads:
        log.info(f"Limiting discovery batch to {max_leads} leads (from {len(maybe_leads)})")
        input_leads = maybe_leads[:max_leads]

    system_prompt, user_prompt = build_discovery_prompt(input_leads)

    try:
        raw_response, usage = _call_grok(system_prompt, user_prompt, grok_config)
    except Exception as e:
        log.error(f"Grok discovery API error: {e}")
        return DiscoveryResult(
            input_leads=input_leads,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            raw_response=f"ERROR: {e}",
        )

    # Parse response
    cleaned = _strip_code_fences(raw_response)
    parsed = {}
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as e:
        log.error(f"Failed to parse discovery JSON: {e}")

    relevant_leads = []
    relevant_decisions = []
    not_relevant_decisions = []

    for item in parsed.get("relevant", []):
        idx = item.get("lead_index")
        if idx is not None and 0 <= idx < len(input_leads):
            lead = input_leads[idx]
            relevant_leads.append(lead)
            relevant_decisions.append({
                "lead_index": idx,
                "username": lead.get("username", "?"),
                "subreddit": lead.get("subreddit", "?"),
                "reason": item.get("reason", "N/A"),
            })

    for item in parsed.get("not_relevant", []):
        idx = item.get("lead_index")
        if idx is not None and 0 <= idx < len(input_leads):
            lead = input_leads[idx]
            not_relevant_decisions.append({
                "lead_index": idx,
                "username": lead.get("username", "?"),
                "subreddit": lead.get("subreddit", "?"),
                "reason": item.get("reason", "N/A"),
            })

    return DiscoveryResult(
        input_leads=input_leads,
        relevant_leads=relevant_leads,
        relevant_decisions=relevant_decisions,
        not_relevant_decisions=not_relevant_decisions,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        raw_response=raw_response,
        model=grok_config.get("model", "grok-4"),
        usage=usage if 'usage' in dir() else {},
    )


def triage_leads_v2(
    leads: list[dict],
    strategy_config: dict,
    strategy_templates: dict,
    grok_config: dict,
) -> TriageResult:
    """
    V2 triage with context awareness.

    Uses the new prompt that includes parent comment and thread title,
    and enforces archetype matching.
    """
    if not leads:
        return TriageResult()

    # Limit leads to prevent token overflow
    max_leads = grok_config.get("max_leads_per_batch", 40)
    if len(leads) > max_leads:
        log.info(f"Limiting triage batch to {max_leads} leads (from {len(leads)})")
        leads = leads[:max_leads]

    allowed_actions = strategy_config.get("allowed_actions", ["comment"])
    strategy_name = strategy_config.get("templates_key", "unknown")

    # Build context-aware prompt
    system_prompt, user_prompt = build_triage_prompt_v2(
        leads, strategy_config, strategy_templates
    )

    # Call Grok
    max_retries = grok_config.get("max_retries", 2)
    raw_response = ""
    usage = {}

    for attempt in range(max_retries):
        try:
            raw_response, usage = _call_grok(system_prompt, user_prompt, grok_config)
            break
        except Exception as e:
            log.warning(f"Grok API error (attempt {attempt + 1}/{max_retries}): {e}")
            if attempt == max_retries - 1:
                log.error("All Grok retries exhausted")
                return TriageResult(raw_response=str(e))

    # Parse and validate
    result = parse_triage_response(raw_response, leads, strategy_templates, allowed_actions)
    result.model = grok_config.get("model", "grok-4")
    result.usage = usage
    result.system_prompt = system_prompt
    result.user_prompt = user_prompt

    return result


def _context_blob(lead: dict) -> str:
    return " ".join(
        part
        for part in [
            lead.get("full_comment_body", ""),
            lead.get("comment_text", ""),
            lead.get("parent_body", ""),
            lead.get("thread_title", ""),
            lead.get("post_title", ""),
            lead.get("keyword_matched", ""),
        ]
        if part
    ).strip()


def _normalized_terms(text: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[a-z0-9]+", (text or "").lower())
        if len(token) >= 4
    }


def _is_low_signal_lead(lead: dict) -> bool:
    username = (lead.get("username", "") or "").lower()
    if username in {"automoderator", "[deleted]", "deleted"} or username.endswith("bot"):
        return True
    text = _context_blob(lead)
    return len(text.strip()) < 24


def _local_relevance_reason(lead: dict, strategy_config: dict) -> str | None:
    if _is_low_signal_lead(lead):
        return None

    text = _context_blob(lead).lower()
    keyword = (lead.get("keyword_matched", "") or "").lower().strip()
    score = 0
    reasons: list[str] = []

    if lead.get("keyword_confirmed"):
        score += 3
        reasons.append("keyword confirmed in the target comment")
    elif keyword and keyword in text:
        score += 2
        reasons.append("matched keyword appears in nearby context")

    archetype = detect_archetype(lead, "comment")
    if archetype in {"competitor_mention", "recommendation_request", "pain_point"}:
        score += 2
        reasons.append(f"clear {archetype.replace('_', ' ')} intent")
    elif archetype == "general_recommendation":
        score += 1
        reasons.append("generic but plausible recommendation context")

    strategy_terms = _normalized_terms(" ".join(strategy_config.get("keywords", [])))
    overlap = strategy_terms.intersection(_normalized_terms(text))
    if overlap:
        score += 1
        reasons.append(f"strategy term overlap: {', '.join(sorted(list(overlap))[:3])}")

    if "?" in text:
        score += 1
        reasons.append("question or request for help")

    if len(text) >= 80:
        score += 1
        reasons.append("enough context to answer meaningfully")

    if score < 2:
        return None
    return "; ".join(reasons)


def discover_relevant_leads_local(
    maybe_leads: list[dict],
    strategy_config: dict,
) -> DiscoveryResult:
    """Local discovery using saved templates and lightweight intent heuristics."""
    if not maybe_leads:
        return DiscoveryResult()

    system_prompt, user_prompt = build_discovery_prompt(maybe_leads)
    relevant_leads = []
    relevant_decisions = []
    not_relevant_decisions = []

    for i, lead in enumerate(maybe_leads):
        reason = _local_relevance_reason(lead, strategy_config)
        payload = {
            "lead_index": i,
            "username": lead.get("username", "?"),
            "subreddit": lead.get("subreddit", "?"),
            "reason": reason or "weak or forced fit",
        }
        if reason:
            relevant_leads.append(lead)
            relevant_decisions.append(payload)
        else:
            not_relevant_decisions.append(payload)

    raw_response = json.dumps(
        {
            "engine": "operator-local",
            "relevant": relevant_decisions,
            "not_relevant": not_relevant_decisions,
        },
        indent=2,
    )

    return DiscoveryResult(
        input_leads=maybe_leads,
        relevant_leads=relevant_leads,
        relevant_decisions=relevant_decisions,
        not_relevant_decisions=not_relevant_decisions,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        raw_response=raw_response,
        model="operator-local",
        usage={},
    )


def _choose_local_action_type(lead: dict, allowed_actions: list[str]) -> str | None:
    if not allowed_actions:
        return None
    if len(allowed_actions) == 1:
        return allowed_actions[0]
    if "comment" not in allowed_actions:
        return allowed_actions[0]

    text = _context_blob(lead)
    dm_archetype = detect_archetype(lead, "dm")
    high_signal = len(text) >= 180 or text.count("?") >= 1 or bool(lead.get("parent_body"))

    if "dm" in allowed_actions and dm_archetype in {"feedback_request", "fellow_user"} and high_signal:
        return "dm"
    return "comment"


def triage_leads_operator(
    leads: list[dict],
    strategy_config: dict,
    strategy_templates: dict,
    config: dict,
) -> TriageResult:
    """Local triage where the operator-authored templates are the decision source."""
    if not leads:
        return TriageResult()

    system_prompt = _load_prompt_file("prompts/triage_v2.txt")
    strategy_prompt = _load_prompt_file(strategy_config["prompt_file"])
    user_prompt = json.dumps(
        [
            {
                "index": i,
                "username": lead.get("username", ""),
                "subreddit": lead.get("subreddit", ""),
                "permalink": lead.get("permalink", ""),
                "keyword_matched": lead.get("keyword_matched", ""),
                "target_comment": lead.get("full_comment_body", lead.get("comment_text", ""))[:400],
                "parent_comment": lead.get("parent_body", "")[:250],
                "thread_title": lead.get("thread_title", lead.get("post_title", ""))[:150],
            }
            for i, lead in enumerate(leads)
        ],
        indent=2,
    )

    approved: list[TriageDecision] = []
    denied: list[dict] = []
    allowed_actions = strategy_config.get("allowed_actions", ["comment"])

    for idx, lead in enumerate(leads):
        if _is_low_signal_lead(lead):
            denied.append(
                {
                    "lead_index": idx,
                    "username": lead.get("username", ""),
                    "reason": "low-signal, deleted, or bot content",
                }
            )
            continue

        action_type = _choose_local_action_type(lead, allowed_actions)
        if not action_type:
            denied.append(
                {
                    "lead_index": idx,
                    "username": lead.get("username", ""),
                    "reason": "no allowed action for this strategy",
                }
            )
            continue

        selection = prepare_template_selection(lead, action_type, strategy_templates, config)
        if not selection:
            denied.append(
                {
                    "lead_index": idx,
                    "username": lead.get("username", ""),
                    "reason": f"no local template available for {action_type}",
                }
            )
            continue

        approved.append(
            TriageDecision(
                lead_index=idx,
                username=lead.get("username", ""),
                permalink=lead.get("permalink", ""),
                action_type=action_type,
                template_name=selection["archetype"],
                template_variation=selection["template_variation"],
                placeholders=selection["placeholders"],
                reasoning=(
                    f"operator-local: {action_type} via {selection['archetype']} "
                    f"because the lead reads like a {selection['archetype'].replace('_', ' ')} thread"
                ),
                custom_message=selection["message"],
            )
        )

    result = TriageResult(
        approved=approved,
        denied=denied,
        raw_response=json.dumps(
            {
                "engine": "operator-local",
                "approved": [decision.to_dict() for decision in approved],
                "denied": denied,
            },
            indent=2,
        ),
        model="operator-local",
        usage={},
        system_prompt=system_prompt + "\n\n## Strategy-Specific Guidance\n" + strategy_prompt,
        user_prompt=user_prompt,
    )
    return result


def full_triage_workflow(
    confirmed_leads: list[dict],
    maybe_leads: list[dict],
    strategy_config: dict,
    strategy_templates: dict,
    config: dict,
    grok_config: dict,
    decision_mode: str = "operator",
) -> TriageResult:
    """
    Full V2 triage workflow:

    1. Discovery: Find relevant leads from maybe pile
    2. Combine: Merge confirmed + discovered leads
    3. Triage: Run browser-collected lead data through the decision engine

    Args:
        confirmed_leads: Leads with keyword confirmed in comment text
        maybe_leads: Leads where keyword was in thread but not confirmed in comment
        strategy_config: Strategy configuration
        strategy_templates: Templates for this strategy
        grok_config: Grok API configuration

    Returns:
        TriageResult with approved and denied leads
    """
    decision_mode = (decision_mode or "operator").strip().lower()

    # Phase 1: Discovery (find relevant leads from maybe pile)
    discovery_result = None
    discovered = []
    if maybe_leads:
        log.step("🔎", f"Running discovery on {len(maybe_leads)} 'maybe' leads...")
        if decision_mode == "grok":
            discovery_result = discover_relevant_leads(maybe_leads, grok_config)
        else:
            discovery_result = discover_relevant_leads_local(maybe_leads, strategy_config)
        discovered = discovery_result.relevant_leads
        if discovered:
            log.success(f"Discovered {len(discovered)} relevant leads from 'maybe' pile")
        else:
            log.info("No additional relevant leads found in 'maybe' pile")

    # Combine all candidates
    all_candidates = confirmed_leads + discovered
    log.step("📋", f"Total candidates: {len(confirmed_leads)} confirmed + {len(discovered)} discovered = {len(all_candidates)}")

    if not all_candidates:
        log.warning("No candidates to triage")
        return TriageResult()

    # Phase 2: Triage from browser-collected lead data only
    if decision_mode == "grok":
        log.step("🤖", f"Sending {len(all_candidates)} leads to Grok for triage...")
        result = triage_leads_v2(
            all_candidates,
            strategy_config,
            strategy_templates,
            grok_config,
        )
    else:
        log.step("🧠", f"Running operator-local triage on {len(all_candidates)} leads...")
        result = triage_leads_operator(
            all_candidates,
            strategy_config,
            strategy_templates,
            config,
        )
    # Store the candidates array for correct index lookup in execution
    result.leads = all_candidates
    # Attach discovery result for full logging
    result.discovery_result = discovery_result
    return result
