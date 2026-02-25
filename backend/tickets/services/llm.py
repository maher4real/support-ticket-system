import json
import logging
import os
import re
from typing import Any

from openai import OpenAI

from tickets.ai_prompts import SENTIMENT_URGENCY_PROMPT, TITLE_SUGGEST_PROMPT
from tickets.llm_prompt import SYSTEM_PROMPT
from tickets.models import Ticket

logger = logging.getLogger(__name__)

DEFAULT_CLASSIFICATION = {
    "suggested_category": "general",
    "suggested_priority": "low",
}
DEFAULT_SENTIMENT_URGENCY = {
    "sentiment": "neutral",
    "urgency_score": 50,
}

DEFAULT_TITLE = "Support request"
PREFERRED_TITLE_MAX_LENGTH = 60
HARD_TITLE_MAX_LENGTH = 120
DEFAULT_OPENAI_TIMEOUT_SECONDS = 3.5
DEFAULT_OPENAI_MAX_RETRIES = 0


def _env_float(name: str, default: float, *, min_value: float | None = None) -> float:
    raw_value = os.getenv(name, "").strip()
    if not raw_value:
        return default

    try:
        parsed = float(raw_value)
    except ValueError:
        return default

    if min_value is not None and parsed < min_value:
        return default
    return parsed


def _env_int(name: str, default: int, *, min_value: int | None = None) -> int:
    raw_value = os.getenv(name, "").strip()
    if not raw_value:
        return default

    try:
        parsed = int(raw_value)
    except ValueError:
        return default

    if min_value is not None and parsed < min_value:
        return default
    return parsed


def _get_client() -> OpenAI | None:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        return None

    timeout = _env_float(
        "OPENAI_TIMEOUT_SECONDS",
        DEFAULT_OPENAI_TIMEOUT_SECONDS,
        min_value=0.1,
    )
    max_retries = _env_int(
        "OPENAI_MAX_RETRIES",
        DEFAULT_OPENAI_MAX_RETRIES,
        min_value=0,
    )
    return OpenAI(api_key=api_key, timeout=timeout, max_retries=max_retries)


def _model_name() -> str:
    return os.getenv("OPENAI_CLASSIFY_MODEL", "gpt-4o-mini")


def _request_structured_json(
    *,
    system_prompt: str,
    user_content: str,
    schema: dict[str, Any],
    max_tokens: int,
) -> Any | None:
    client = _get_client()
    if client is None:
        return None

    completion = client.chat.completions.create(
        model=_model_name(),
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
        response_format={"type": "json_schema", "json_schema": schema},
        temperature=0,
        max_tokens=max_tokens,
    )

    if not completion.choices:
        return None

    content = completion.choices[0].message.content
    if not content:
        return None

    return json.loads(content)


def _fallback_title(description: str) -> str:
    compact = " ".join((description or "").split()).strip()
    if not compact:
        return DEFAULT_TITLE

    first_sentence = re.split(r"(?<=[.!?])\s+", compact, maxsplit=1)[0].strip()
    if not first_sentence:
        first_sentence = compact

    candidate = first_sentence.strip(" \"'`").rstrip(" .!?;:")
    if not candidate:
        return DEFAULT_TITLE

    if len(candidate) > PREFERRED_TITLE_MAX_LENGTH:
        candidate = candidate[:PREFERRED_TITLE_MAX_LENGTH].rstrip()

    return candidate or DEFAULT_TITLE


def _normalize_title(raw_title: Any) -> str | None:
    if not isinstance(raw_title, str):
        return None

    title = " ".join(raw_title.split()).strip()
    if not title:
        return None

    title = title.strip(" \"'`").rstrip(" .!?;:")
    if not title:
        return None

    if len(title) > HARD_TITLE_MAX_LENGTH:
        title = title[:HARD_TITLE_MAX_LENGTH].rstrip()

    return title or None


def _validate_classification_payload(payload: Any) -> dict[str, str] | None:
    if not isinstance(payload, dict):
        return None

    category = payload.get("suggested_category")
    priority = payload.get("suggested_priority")

    if category not in set(Ticket.Category.values):
        return None
    if priority not in set(Ticket.Priority.values):
        return None

    return {
        "suggested_category": category,
        "suggested_priority": priority,
    }


def _validate_sentiment_urgency_payload(payload: Any) -> dict[str, Any] | None:
    if not isinstance(payload, dict):
        return None

    sentiment = payload.get("sentiment")
    urgency_score = payload.get("urgency_score")

    if sentiment not in set(Ticket.Sentiment.values):
        return None

    if isinstance(urgency_score, bool):
        return None
    if isinstance(urgency_score, float) and urgency_score.is_integer():
        urgency_score = int(urgency_score)
    if not isinstance(urgency_score, int):
        return None
    if urgency_score < 0 or urgency_score > 100:
        return None

    return {"sentiment": sentiment, "urgency_score": urgency_score}


def classify_ticket(description: str) -> dict[str, str]:
    schema = {
        "name": "ticket_classification",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "suggested_category": {
                    "type": "string",
                    "enum": list(Ticket.Category.values),
                },
                "suggested_priority": {
                    "type": "string",
                    "enum": list(Ticket.Priority.values),
                },
            },
            "required": ["suggested_category", "suggested_priority"],
            "additionalProperties": False,
        },
    }

    try:
        parsed = _request_structured_json(
            system_prompt=SYSTEM_PROMPT,
            user_content=description,
            schema=schema,
            max_tokens=40,
        )
        validated = _validate_classification_payload(parsed)
        return validated or DEFAULT_CLASSIFICATION.copy()
    except Exception:
        logger.warning("AI classification failed; using default classification.")
        return DEFAULT_CLASSIFICATION.copy()


def suggest_title(description: str) -> str:
    fallback_title = _fallback_title(description)
    schema = {
        "name": "ticket_title_suggestion",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "suggested_title": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": HARD_TITLE_MAX_LENGTH,
                }
            },
            "required": ["suggested_title"],
            "additionalProperties": False,
        },
    }

    try:
        parsed = _request_structured_json(
            system_prompt=TITLE_SUGGEST_PROMPT,
            user_content=description,
            schema=schema,
            max_tokens=32,
        )
        if not isinstance(parsed, dict):
            return fallback_title

        normalized = _normalize_title(parsed.get("suggested_title"))
        return normalized or fallback_title
    except Exception:
        logger.warning("AI title suggestion failed; using fallback title.")
        return fallback_title


def score_sentiment_urgency(title: str, description: str) -> dict[str, Any]:
    schema = {
        "name": "ticket_sentiment_urgency",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "sentiment": {
                    "type": "string",
                    "enum": list(Ticket.Sentiment.values),
                },
                "urgency_score": {
                    "type": "integer",
                    "minimum": 0,
                    "maximum": 100,
                },
            },
            "required": ["sentiment", "urgency_score"],
            "additionalProperties": False,
        },
    }

    prompt_input = f"Title: {title.strip()}\nDescription: {description.strip()}"
    try:
        parsed = _request_structured_json(
            system_prompt=SENTIMENT_URGENCY_PROMPT,
            user_content=prompt_input,
            schema=schema,
            max_tokens=48,
        )
        validated = _validate_sentiment_urgency_payload(parsed)
        return validated or DEFAULT_SENTIMENT_URGENCY.copy()
    except Exception:
        logger.warning("AI sentiment/urgency scoring failed; using defaults.")
        return DEFAULT_SENTIMENT_URGENCY.copy()
