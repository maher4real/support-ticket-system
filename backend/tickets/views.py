import json
import os
from typing import Any

from django.db.models import Avg, Count, FloatField, Q, Value
from django.db.models.functions import Cast, Coalesce, TruncDate
from openai import OpenAI
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .llm_prompt import SYSTEM_PROMPT
from .models import Ticket
from .serializers import (
    TicketClassifyRequestSerializer,
    TicketClassifyResponseSerializer,
    TicketSerializer,
)

DEFAULT_CLASSIFICATION = {
    "suggested_category": Ticket.Category.GENERAL,
    "suggested_priority": Ticket.Priority.LOW,
}


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


def _classify_with_llm(description: str) -> dict[str, str]:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        return DEFAULT_CLASSIFICATION.copy()

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
        client = OpenAI(api_key=api_key, timeout=10.0)
        completion = client.chat.completions.create(
            model=os.getenv("OPENAI_CLASSIFY_MODEL", "gpt-4o-mini"),
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": description},
            ],
            response_format={
                "type": "json_schema",
                "json_schema": schema,
            },
            temperature=0,
        )

        if not completion.choices:
            return DEFAULT_CLASSIFICATION.copy()

        content = completion.choices[0].message.content
        if not content:
            return DEFAULT_CLASSIFICATION.copy()

        parsed = json.loads(content)
        validated = _validate_classification_payload(parsed)
        return validated or DEFAULT_CLASSIFICATION.copy()
    except Exception:
        return DEFAULT_CLASSIFICATION.copy()


class TicketViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = TicketSerializer
    queryset = Ticket.objects.all().order_by("-created_at")
    filterset_fields = ["category", "priority", "status"]
    search_fields = ["title", "description"]
    ordering_fields = ["created_at"]
    ordering = ["-created_at"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    @action(detail=False, methods=["get"], url_path="stats")
    def stats(self, request) -> Response:
        aggregates = Ticket.objects.aggregate(
            total_tickets=Count("id"),
            open_tickets=Count("id", filter=Q(status=Ticket.Status.OPEN)),
            priority_low=Count("id", filter=Q(priority=Ticket.Priority.LOW)),
            priority_medium=Count("id", filter=Q(priority=Ticket.Priority.MEDIUM)),
            priority_high=Count("id", filter=Q(priority=Ticket.Priority.HIGH)),
            priority_critical=Count("id", filter=Q(priority=Ticket.Priority.CRITICAL)),
            category_billing=Count("id", filter=Q(category=Ticket.Category.BILLING)),
            category_technical=Count("id", filter=Q(category=Ticket.Category.TECHNICAL)),
            category_account=Count("id", filter=Q(category=Ticket.Category.ACCOUNT)),
            category_general=Count("id", filter=Q(category=Ticket.Category.GENERAL)),
        )

        daily_counts = (
            Ticket.objects.annotate(day=TruncDate("created_at"))
            .values("day")
            .annotate(ticket_count=Count("id"))
        )
        avg_tickets_per_day = daily_counts.aggregate(
            avg=Coalesce(Cast(Avg("ticket_count"), FloatField()), Value(0.0))
        )["avg"]

        return Response(
            {
                "total_tickets": aggregates["total_tickets"] or 0,
                "open_tickets": aggregates["open_tickets"] or 0,
                "avg_tickets_per_day": float(avg_tickets_per_day or 0.0),
                "priority_breakdown": {
                    "low": aggregates["priority_low"] or 0,
                    "medium": aggregates["priority_medium"] or 0,
                    "high": aggregates["priority_high"] or 0,
                    "critical": aggregates["priority_critical"] or 0,
                },
                "category_breakdown": {
                    "billing": aggregates["category_billing"] or 0,
                    "technical": aggregates["category_technical"] or 0,
                    "account": aggregates["category_account"] or 0,
                    "general": aggregates["category_general"] or 0,
                },
            }
        )

    @action(detail=False, methods=["post"], url_path="classify")
    def classify(self, request) -> Response:
        request_serializer = TicketClassifyRequestSerializer(data=request.data)
        request_serializer.is_valid(raise_exception=True)

        classification = _classify_with_llm(
            request_serializer.validated_data["description"]
        )
        response_serializer = TicketClassifyResponseSerializer(data=classification)
        if not response_serializer.is_valid():
            return Response(DEFAULT_CLASSIFICATION, status=status.HTTP_200_OK)

        return Response(response_serializer.validated_data, status=status.HTTP_200_OK)
