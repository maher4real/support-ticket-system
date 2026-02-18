from django.db import models


class Ticket(models.Model):
    class Category(models.TextChoices):
        BILLING = "billing", "Billing"
        TECHNICAL = "technical", "Technical"
        ACCOUNT = "account", "Account"
        GENERAL = "general", "General"

    class Priority(models.TextChoices):
        LOW = "low", "Low"
        MEDIUM = "medium", "Medium"
        HIGH = "high", "High"
        CRITICAL = "critical", "Critical"

    class Status(models.TextChoices):
        OPEN = "open", "Open"
        IN_PROGRESS = "in_progress", "In Progress"
        RESOLVED = "resolved", "Resolved"
        CLOSED = "closed", "Closed"

    class Sentiment(models.TextChoices):
        CALM = "calm", "Calm"
        NEUTRAL = "neutral", "Neutral"
        FRUSTRATED = "frustrated", "Frustrated"
        ANGRY = "angry", "Angry"

    title = models.CharField(max_length=200, null=False, blank=False)
    description = models.TextField(null=False, blank=False)
    category = models.CharField(
        max_length=20,
        choices=Category.choices,
        null=False,
        blank=False,
    )
    priority = models.CharField(
        max_length=20,
        choices=Priority.choices,
        null=False,
        blank=False,
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.OPEN,
        null=False,
        blank=False,
    )
    sentiment = models.CharField(
        max_length=20,
        choices=Sentiment.choices,
        default=Sentiment.NEUTRAL,
        null=False,
        blank=False,
    )
    urgency_score = models.PositiveSmallIntegerField(default=50, null=False, blank=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(
                check=models.Q(
                    category__in=[
                        "billing",
                        "technical",
                        "account",
                        "general",
                    ]
                ),
                name="ticket_category_valid",
            ),
            models.CheckConstraint(
                check=models.Q(
                    priority__in=[
                        "low",
                        "medium",
                        "high",
                        "critical",
                    ]
                ),
                name="ticket_priority_valid",
            ),
            models.CheckConstraint(
                check=models.Q(
                    status__in=[
                        "open",
                        "in_progress",
                        "resolved",
                        "closed",
                    ]
                ),
                name="ticket_status_valid",
            ),
            models.CheckConstraint(
                check=models.Q(
                    sentiment__in=[
                        "calm",
                        "neutral",
                        "frustrated",
                        "angry",
                    ]
                ),
                name="ticket_sentiment_valid",
            ),
            models.CheckConstraint(
                check=models.Q(urgency_score__gte=0, urgency_score__lte=100),
                name="ticket_urgency_range",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.title} ({self.status})"
