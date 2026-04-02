"""
Local triage module for lead evaluation and template selection.

Prompt files can reference runtime product fields with {{TOKEN}} placeholders,
which are populated from config.json for logging and operator review.
"""

import json
import os
import re

from src.reddit.decision.templates import detect_archetype, prepare_template_selection
from src.reddit.runtime.models import DiscoveryResult, TriageDecision, TriageResult
from src.reddit.shared.project_paths import PROJECT_DIR as BASE_DIR, REPO_DIR
from src.reddit.shared.utils import log


def _load_prompt_file(filename: str) -> str:
    aliases = {
        "prompts/base_system.txt": "guidance/base_system.md",
        "prompts/competitor_alternative.txt": "guidance/competitor_alternative.md",
        "prompts/discovery.txt": "guidance/discovery.md",
        "prompts/problem_aware.txt": "guidance/problem_aware.md",
        "prompts/triage_v2.txt": "guidance/triage_v2.md",
    }
    normalized = aliases.get(filename, filename)
    path = os.path.join(BASE_DIR, normalized)
    if not os.path.exists(path):
        path = os.path.join(REPO_DIR, "starter-assets", "reddit", normalized)
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


def build_discovery_prompt(leads: list[dict]) -> tuple[str, str]:
    """Build prompt-shaped logging payload for maybe-lead discovery."""
    system_prompt = _load_prompt_file("guidance/discovery.md")

    parts = ["## Maybe Leads (keyword not confirmed in comment)\n"]
    leads_for_prompt = []
    for i, lead in enumerate(leads):
        leads_for_prompt.append(
            {
                "index": i,
                "username": lead.get("username", ""),
                "subreddit": lead.get("subreddit", ""),
                "comment_text": lead.get("comment_text", "")[:300],
                "thread_title": lead.get("thread_title", lead.get("post_title", ""))[:100],
                "keyword_matched": lead.get("keyword_matched", ""),
            }
        )

    parts.append(json.dumps(leads_for_prompt, indent=2))
    user_prompt = "\n".join(parts)
    return system_prompt, user_prompt


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


def draft_leads_operator(
    leads: list[dict],
    strategy_config: dict,
    strategy_templates: dict,
    config: dict,
) -> TriageResult:
    """Draft candidate actions locally from operator-authored templates."""
    if not leads:
        return TriageResult()

    system_prompt = _load_prompt_file("guidance/triage_v2.md")
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
                    f"operator-draft: {action_type} via {selection['archetype']} "
                    f"because the lead reads like a {selection['archetype'].replace('_', ' ')} thread"
                ),
                custom_message=selection["message"],
            )
        )

    return TriageResult(
        approved=approved,
        denied=denied,
        raw_response=json.dumps(
            {
                "engine": "operator-draft",
                "drafts": [decision.to_dict() for decision in approved],
                "denied": denied,
            },
            indent=2,
        ),
        model="operator-draft",
        usage={},
        system_prompt=system_prompt + "\n\n## Strategy-Specific Guidance\n" + strategy_prompt,
        user_prompt=user_prompt,
    )


def full_triage_workflow(
    confirmed_leads: list[dict],
    maybe_leads: list[dict],
    strategy_config: dict,
    strategy_templates: dict,
    config: dict,
) -> TriageResult:
    """
    Local triage workflow:

    1. Discover relevant leads from the maybe pile.
    2. Combine confirmed + discovered leads.
    3. Draft operator-review candidates locally.
    """
    discovery_result = None
    discovered = []
    if maybe_leads:
        log.step("🔎", f"Running discovery on {len(maybe_leads)} 'maybe' leads...")
        discovery_result = discover_relevant_leads_local(maybe_leads, strategy_config)
        discovered = discovery_result.relevant_leads
        if discovered:
            log.success(f"Discovered {len(discovered)} relevant leads from 'maybe' pile")
        else:
            log.info("No additional relevant leads found in 'maybe' pile")

    all_candidates = confirmed_leads + discovered
    log.step("📋", f"Total candidates: {len(confirmed_leads)} confirmed + {len(discovered)} discovered = {len(all_candidates)}")

    if not all_candidates:
        log.warning("No candidates to triage")
        return TriageResult()

    log.step("🧠", f"Drafting operator-review candidates for {len(all_candidates)} leads...")
    result = draft_leads_operator(
        all_candidates,
        strategy_config,
        strategy_templates,
        config,
    )
    result.leads = all_candidates
    result.discovery_result = discovery_result
    return result
