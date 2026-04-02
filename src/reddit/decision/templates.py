import random
import re

RECOMMENDATION_PHRASES = [
    "recommend",
    "looking for",
    "any suggestions",
    "alternative",
    "better than",
    "replace",
    "replacement",
    "anyone know",
    "does anyone",
    "what tool",
    "what app",
    "what software",
]

FRUSTRATION_CUES = [
    "annoying",
    "frustrating",
    "pain",
    "takes forever",
    "hate",
    "manual",
    "broken",
    "hard to",
    "struggling",
    "messy",
]

COMPARISON_CUES = [
    "vs",
    "compared to",
    "switched from",
    "moved from",
    "using ",
]

_last_used = {}


def _blob(lead):
    return " ".join(
        [
            lead.get("comment_text", ""),
            lead.get("post_title", ""),
            lead.get("thread_title", ""),
        ]
    ).lower()


def _friendly_username(username):
    if not username:
        return "there"
    if "_" in username:
        username = username.split("_")[0]
    elif "-" in username:
        username = username.split("-")[0]
    return username or "there"


def _has_recommendation_intent(text):
    return any(phrase in text for phrase in RECOMMENDATION_PHRASES)


def _has_frustration(text):
    return any(phrase in text for phrase in FRUSTRATION_CUES)


def _has_competitor_context(text, keyword):
    if any(phrase in text for phrase in COMPARISON_CUES):
        return True
    keyword = (keyword or "").strip().lower()
    return bool(keyword and len(keyword.split()) <= 6 and " " in keyword)


def detect_archetype(lead, action_type):
    """Determine which generic outreach archetype best fits the lead."""
    text = _blob(lead)
    keyword = lead.get("keyword_matched", "").lower()

    if action_type == "dm":
        if _has_competitor_context(text, keyword):
            return "fellow_user"
        if _has_recommendation_intent(text) or "?" in lead.get("comment_text", ""):
            return "feedback_request"
        if _has_frustration(text):
            return "pain_point"
        return "soft_tease"

    if _has_competitor_context(text, keyword):
        return "competitor_mention"
    if _has_recommendation_intent(text) or "?" in lead.get("comment_text", ""):
        return "recommendation_request"
    if _has_frustration(text):
        return "pain_point"
    return "general_recommendation"


def extract_competitor_mentioned(lead):
    keyword = (lead.get("keyword_matched", "") or "").strip()
    if keyword:
        return keyword
    text = lead.get("comment_text", "") or lead.get("post_title", "")
    quoted = re.findall(r'"([^"]+)"', text)
    if quoted:
        return quoted[0]
    return "other tools"


def extract_topic(lead):
    text = (lead.get("comment_text", "") or lead.get("post_title", "")).strip()
    if not text:
        return "this workflow"
    short = text[:60].rsplit(" ", 1)[0] if len(text) > 60 else text
    return short.rstrip(".,!?").lower()


def extract_pain_point(lead):
    text = (lead.get("comment_text", "") or lead.get("post_title", "")).strip()
    if not text:
        return lead.get("keyword_matched", "this problem")
    sentence = re.split(r"[.!?]", text)[0].strip()
    sentence = sentence[:80].rsplit(" ", 1)[0] if len(sentence) > 80 else sentence
    return sentence.lower() or lead.get("keyword_matched", "this problem")


def build_placeholders(lead, config=None):
    """Build reusable placeholder values from lead + product context."""
    product = (config or {}).get("product", {})
    topic = extract_topic(lead)
    pain_point = extract_pain_point(lead)
    competitor = extract_competitor_mentioned(lead)
    value_props = product.get("value_props", [])
    value_prop = value_props[0] if value_props else product.get("summary", "solving the problem more cleanly")

    return {
        "username": _friendly_username(lead.get("username", "")),
        "subreddit": lead.get("subreddit", "").lstrip("r/"),
        "topic": topic,
        "pain_point": pain_point,
        "competitor_mentioned": competitor,
        "post_or_comment": "comment" if lead.get("source") == "comment_search" else "post",
        "their_text_snippet": (lead.get("comment_text", "")[:80] + "...") if lead.get("comment_text", "") else "",
        "product_name": product.get("name", "your product"),
        "product_url": product.get("url", ""),
        "research_url": product.get("research_url", ""),
        "product_summary": product.get("summary", "a product worth checking out"),
        "target_audience": product.get("target_audience", "the right users"),
        "value_prop": value_prop,
        "cta": product.get("cta", "If helpful, I can send the link."),
        "app_mentioned": competitor,
        "ingredient": topic,
    }


def render_with_placeholders(template: str, placeholders: dict) -> str:
    filled = template
    for key, value in placeholders.items():
        filled = filled.replace("{" + key + "}", str(value))
    return filled


def select_template_variation(action_type, archetype, templates):
    """Choose a concrete template variation for an archetype with simple rotation."""
    if action_type == "dm":
        template_list = templates.get("dm_templates", {}).get(archetype, [])
        subject_template = templates.get("dm_subjects", {}).get(archetype, "quick note")
    else:
        template_list = templates.get("comment_templates", {}).get(archetype, [])
        subject_template = None

    if not template_list:
        return None, None, subject_template

    rotation_key = f"{action_type}_{archetype}"
    last_index = _last_used.get(rotation_key, -1)
    available = list(range(len(template_list)))
    if len(available) > 1 and last_index in available:
        available.remove(last_index)

    chosen_index = random.choice(available)
    _last_used[rotation_key] = chosen_index
    return chosen_index, template_list[chosen_index], subject_template


def prepare_template_selection(lead, action_type, templates, config=None):
    """Select archetype + concrete variation and fill it with current lead context."""
    archetype = detect_archetype(lead, action_type)
    variation, template, subject_template = select_template_variation(action_type, archetype, templates)
    if template is None:
        return None

    placeholders = build_placeholders(lead, config)
    filled = render_with_placeholders(template, placeholders)
    subject = render_with_placeholders(subject_template, placeholders) if subject_template else None

    return {
        "archetype": archetype,
        "template_variation": variation,
        "placeholders": placeholders,
        "message": filled,
        "subject": subject,
    }


def select_and_fill(lead, action_type, templates, config=None):
    """Select a template archetype, then fill it with lead + product placeholders."""
    selection = prepare_template_selection(lead, action_type, templates, config)
    archetype = detect_archetype(lead, action_type)
    if not selection:
        return None, archetype, None
    return selection["message"], selection["archetype"], selection["subject"]


def fill_template_from_decision(decision, strategy_templates: dict) -> str | None:
    """Fill a template using the chosen template + placeholders."""
    if decision.custom_message:
        filled = decision.custom_message
        for key, value in decision.placeholders.items():
            filled = filled.replace("{" + key + "}", str(value))
        return filled

    action_key = "dm_templates" if decision.action_type == "dm" else "comment_templates"
    template_list = strategy_templates.get(action_key, {}).get(decision.template_name, [])
    if not template_list or decision.template_variation >= len(template_list):
        return None

    template = template_list[decision.template_variation]
    return render_with_placeholders(template, decision.placeholders)


def fill_subject_from_decision(decision, strategy_templates: dict) -> str:
    """Fill a DM subject line using the chosen placeholders."""
    subject_template = strategy_templates.get("dm_subjects", {}).get(decision.template_name, "quick note")
    return render_with_placeholders(subject_template, decision.placeholders)
