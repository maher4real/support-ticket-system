from django.db.models import Avg, Count, FloatField, Q, Value
from django.db.models.functions import Cast, Coalesce, TruncDate
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Ticket
from .serializers import (
    TicketClassifyRequestSerializer,
    TicketClassifyResponseSerializer,
    TicketSuggestTitleRequestSerializer,
    TicketSuggestTitleResponseSerializer,
    TicketSerializer,
)
from .services.llm import (
    DEFAULT_CLASSIFICATION,
    classify_ticket,
    score_sentiment_urgency,
    suggest_title as llm_suggest_title,
)


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

    def perform_create(self, serializer) -> None:
        title = serializer.validated_data.get("title", "")
        description = serializer.validated_data.get("description", "")
        ai_signals = score_sentiment_urgency(title=title, description=description)
        serializer.save(**ai_signals)

    def perform_update(self, serializer) -> None:
        instance = serializer.instance
        title_changed = "title" in serializer.validated_data
        description_changed = "description" in serializer.validated_data

        if title_changed or description_changed:
            title = serializer.validated_data.get("title", instance.title)
            description = serializer.validated_data.get(
                "description", instance.description
            )
            ai_signals = score_sentiment_urgency(title=title, description=description)
            serializer.save(**ai_signals)
            return

        serializer.save()

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
            sentiment_calm=Count("id", filter=Q(sentiment=Ticket.Sentiment.CALM)),
            sentiment_neutral=Count(
                "id", filter=Q(sentiment=Ticket.Sentiment.NEUTRAL)
            ),
            sentiment_frustrated=Count(
                "id", filter=Q(sentiment=Ticket.Sentiment.FRUSTRATED)
            ),
            sentiment_angry=Count("id", filter=Q(sentiment=Ticket.Sentiment.ANGRY)),
            avg_urgency_score=Coalesce(Cast(Avg("urgency_score"), FloatField()), Value(0.0)),
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
                "sentiment_breakdown": {
                    "calm": aggregates["sentiment_calm"] or 0,
                    "neutral": aggregates["sentiment_neutral"] or 0,
                    "frustrated": aggregates["sentiment_frustrated"] or 0,
                    "angry": aggregates["sentiment_angry"] or 0,
                },
                "avg_urgency_score": float(aggregates["avg_urgency_score"] or 0.0),
            }
        )

    @action(detail=False, methods=["post"], url_path="classify")
    def classify(self, request) -> Response:
        request_serializer = TicketClassifyRequestSerializer(data=request.data)
        request_serializer.is_valid(raise_exception=True)

        classification = classify_ticket(request_serializer.validated_data["description"])
        response_serializer = TicketClassifyResponseSerializer(data=classification)
        if not response_serializer.is_valid():
            return Response(DEFAULT_CLASSIFICATION, status=status.HTTP_200_OK)

        return Response(response_serializer.validated_data, status=status.HTTP_200_OK)

    @action(detail=False, methods=["post"], url_path="suggest-title")
    def suggest_title(self, request) -> Response:
        request_serializer = TicketSuggestTitleRequestSerializer(data=request.data)
        request_serializer.is_valid(raise_exception=True)

        suggested_title = llm_suggest_title(request_serializer.validated_data["description"])
        response_serializer = TicketSuggestTitleResponseSerializer(
            data={"suggested_title": suggested_title}
        )
        if not response_serializer.is_valid():
            return Response(
                {"suggested_title": "Support request"},
                status=status.HTTP_200_OK,
            )

        return Response(response_serializer.validated_data, status=status.HTTP_200_OK)
