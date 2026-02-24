import os
from unittest.mock import patch

from django.db import IntegrityError, transaction
from django.test import TestCase
from django.test.utils import override_settings
from rest_framework.test import APIClient

from .models import Ticket


@override_settings(ALLOWED_HOSTS=["testserver", "localhost", "127.0.0.1"])
class TicketApiTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()

    def _create_ticket(self, **overrides):
        payload = {
            "title": "Cannot login after reset",
            "description": "Users are locked out and cannot sign in after reset.",
            "category": "account",
            "priority": "high",
        }
        payload.update(overrides)
        return self.client.post("/api/tickets/", payload, format="json")

    @patch.dict(os.environ, {"OPENAI_API_KEY": ""}, clear=False)
    def test_create_ticket_works_with_ai_fallback(self):
        response = self._create_ticket()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["sentiment"], "neutral")
        self.assertEqual(response.data["urgency_score"], 50)

    @patch.dict(os.environ, {"OPENAI_API_KEY": ""}, clear=False)
    def test_classify_returns_safe_defaults_when_key_missing(self):
        response = self.client.post(
            "/api/tickets/classify/",
            {"description": "Anything"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.data,
            {"suggested_category": "general", "suggested_priority": "low"},
        )

    @patch.dict(os.environ, {"OPENAI_API_KEY": ""}, clear=False)
    def test_suggest_title_fallback_is_non_empty_and_short(self):
        response = self.client.post(
            "/api/tickets/suggest-title/",
            {
                "description": (
                    "This is a long support request sentence that should become a "
                    "short fallback title when AI is unavailable."
                )
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        title = response.data["suggested_title"]
        self.assertTrue(isinstance(title, str))
        self.assertTrue(title.strip())
        self.assertLessEqual(len(title), 120)

    @patch.dict(os.environ, {"OPENAI_API_KEY": ""}, clear=False)
    def test_filters_and_search_work_together(self):
        self._create_ticket(
            title="Checkout timeout",
            description="Checkout request times out for all users.",
            category="technical",
            priority="critical",
        )
        self._create_ticket(
            title="Refund question",
            description="Need an invoice refund for duplicate charge.",
            category="billing",
            priority="medium",
        )

        response = self.client.get(
            "/api/tickets/",
            {
                "category": "technical",
                "priority": "critical",
                "status": "open",
                "search": "timeout",
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["category"], "technical")
        self.assertEqual(response.data[0]["priority"], "critical")

    @patch.dict(os.environ, {"OPENAI_API_KEY": ""}, clear=False)
    def test_stats_shape_contains_required_and_extended_keys(self):
        self._create_ticket(category="billing", priority="medium")
        self._create_ticket(category="technical", priority="critical")

        response = self.client.get("/api/tickets/stats/")
        self.assertEqual(response.status_code, 200)

        data = response.data
        self.assertIn("total_tickets", data)
        self.assertIn("open_tickets", data)
        self.assertIn("avg_tickets_per_day", data)
        self.assertIn("priority_breakdown", data)
        self.assertIn("category_breakdown", data)
        self.assertIn("sentiment_breakdown", data)
        self.assertIn("avg_urgency_score", data)

        self.assertEqual(
            set(data["priority_breakdown"].keys()),
            {"low", "medium", "high", "critical"},
        )
        self.assertEqual(
            set(data["category_breakdown"].keys()),
            {"billing", "technical", "account", "general"},
        )
        self.assertEqual(
            set(data["sentiment_breakdown"].keys()),
            {"calm", "neutral", "frustrated", "angry"},
        )

    @patch("tickets.views.score_sentiment_urgency")
    @patch.dict(os.environ, {"OPENAI_API_KEY": ""}, clear=False)
    def test_patch_recomputes_ai_only_for_text_changes(self, mock_score):
        mock_score.return_value = {"sentiment": "frustrated", "urgency_score": 88}
        created = self._create_ticket()
        ticket_id = created.data["id"]

        mock_score.reset_mock()
        patch_status_only = self.client.patch(
            f"/api/tickets/{ticket_id}/",
            {"status": "resolved"},
            format="json",
        )
        self.assertEqual(patch_status_only.status_code, 200)
        mock_score.assert_not_called()

        patch_description = self.client.patch(
            f"/api/tickets/{ticket_id}/",
            {"description": "This is now urgent and blocking teams."},
            format="json",
        )
        self.assertEqual(patch_description.status_code, 200)
        self.assertEqual(patch_description.data["sentiment"], "frustrated")
        self.assertEqual(patch_description.data["urgency_score"], 88)
        self.assertEqual(mock_score.call_count, 1)

    def test_db_constraint_blocks_invalid_urgency_score(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Ticket.objects.create(
                    title="Bad score",
                    description="Invalid urgency value",
                    category="general",
                    priority="low",
                    urgency_score=101,
                )
