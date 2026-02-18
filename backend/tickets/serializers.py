from rest_framework import serializers

from .models import Ticket


class TicketSerializer(serializers.ModelSerializer):
    class Meta:
        model = Ticket
        fields = [
            "id",
            "title",
            "description",
            "category",
            "priority",
            "status",
            "sentiment",
            "urgency_score",
            "created_at",
        ]
        read_only_fields = ["id", "created_at", "sentiment", "urgency_score"]

    def validate_title(self, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise serializers.ValidationError("Title is required.")
        if len(cleaned) > 200:
            raise serializers.ValidationError("Title must be 200 characters or fewer.")
        return cleaned

    def validate_description(self, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise serializers.ValidationError("Description is required.")
        return cleaned


class TicketClassifyRequestSerializer(serializers.Serializer):
    description = serializers.CharField(
        required=True,
        allow_blank=False,
        trim_whitespace=True,
    )


class TicketClassifyResponseSerializer(serializers.Serializer):
    suggested_category = serializers.ChoiceField(choices=Ticket.Category.values)
    suggested_priority = serializers.ChoiceField(choices=Ticket.Priority.values)


class TicketSuggestTitleRequestSerializer(serializers.Serializer):
    description = serializers.CharField(
        required=True,
        allow_blank=False,
        trim_whitespace=True,
    )


class TicketSuggestTitleResponseSerializer(serializers.Serializer):
    suggested_title = serializers.CharField(
        required=True,
        allow_blank=False,
        trim_whitespace=True,
        max_length=120,
    )
