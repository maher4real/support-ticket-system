# Support Ticket System

## Run
```bash
docker compose up --build
```

## URLs
- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8000`
- Admin: `http://localhost:8000/admin/`

## Environment Variables
Set these in `.env`:

```env
POSTGRES_DB=tickets
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_HOST=db
POSTGRES_PORT=5432
OPENAI_API_KEY=
OPENAI_CLASSIFY_MODEL=gpt-4o-mini
```

Notes:
- `.env` is gitignored.
- `OPENAI_API_KEY` is optional. If missing or classification fails, classify endpoint returns safe defaults.

## LLM Choice And Design Decisions
- LLM provider/model: `OpenAI` with `gpt-4o-mini` (configurable through `OPENAI_CLASSIFY_MODEL`).
- Why this model: low latency and lower cost for short classification tasks while still producing reliable structured JSON.
- Prompt strategy:
  - `backend/tickets/llm_prompt.py`: category + priority classification prompt
  - `backend/tickets/ai_prompts.py`: title suggestion + sentiment/urgency prompts
- Reliability:
  - classify endpoint uses strict JSON schema output + server-side validation and always falls back to:
  - `{"suggested_category":"general","suggested_priority":"low"}`
  - title suggestion endpoint falls back to first sentence (trimmed) or `"Support request"`
  - sentiment/urgency scoring falls back to `sentiment="neutral"` and `urgency_score=50`
  when API key is missing, network fails, API output is invalid, or timeout occurs.
- UX decision: AI suggestions are non-blocking and user-overridable; ticket creation still works even if LLM fails.

## API Endpoints
All endpoints are under `/api/`.

### Create Ticket
```bash
curl -X POST http://localhost:8000/api/tickets/ \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Cannot login",
    "description": "I get invalid credentials even after reset",
    "category": "account",
    "priority": "high"
  }'
```

### List Tickets (filter + search)
```bash
curl "http://localhost:8000/api/tickets/?category=technical&status=open&search=timeout"
```

### Update Ticket Status
```bash
curl -X PATCH http://localhost:8000/api/tickets/1/ \
  -H "Content-Type: application/json" \
  -d '{"status":"resolved"}'
```

### Stats
```bash
curl http://localhost:8000/api/tickets/stats/
```

### Classify Description
```bash
curl -X POST http://localhost:8000/api/tickets/classify/ \
  -H "Content-Type: application/json" \
  -d '{"description":"Production checkout fails with 500 for all users"}'
```

### Suggest Title
```bash
curl -X POST http://localhost:8000/api/tickets/suggest-title/ \
  -H "Content-Type: application/json" \
  -d '{"description":"Payment was charged twice and invoice totals are incorrect"}'
```

## New AI Features
- AI Title Suggestion:
  - Frontend form has a `Suggest Title` button (non-spamming single call).
  - If title is empty/unedited, suggestion auto-fills.
  - If user already typed a title, UI shows `Apply suggestion` so it is non-destructive.
- Sentiment + Urgency Scoring:
  - Backend computes `sentiment` (`calm|neutral|frustrated|angry`) and `urgency_score` (`0..100`) on create.
  - Backend recomputes only when `title` or `description` changes on update.
  - Meaning:
    - `sentiment` reflects tone/frustration in the message.
    - `urgency_score` reflects urgency/business impact cues (outage/deadline/blocker signals).

## Implementation Notes
- Ticket constraints are enforced at DB-level with `CheckConstraint`s.
- Additional DB constraints:
  - `sentiment` in `calm|neutral|frustrated|angry`
  - `urgency_score` in range `0..100`
- Stats use ORM aggregation/annotation only (no per-ticket Python loops).
- Stats now include:
  - `sentiment_breakdown`
  - `avg_urgency_score`
- Backend applies migrations on container startup.
- Docker startup is hardened with Postgres healthcheck + backend dependency on `service_healthy`.
- Frontend Ticket Form includes a non-spamming `Suggest Title` action button.
- Ticket create and update never fail if AI fails; backend safely falls back.

## Acceptance Checklist
- [x] Ticket model fields + choices + DB constraints: `backend/tickets/models.py`, `backend/tickets/migrations/0001_initial.py`
- [x] Sentiment + urgency model fields + DB constraints: `backend/tickets/models.py`, `backend/tickets/migrations/0002_ticket_ai_signals.py`
- [x] Ticket serializer + clean validation: `backend/tickets/serializers.py`
- [x] CRUD endpoints (`POST /api/tickets/`, `GET /api/tickets/`, `PATCH /api/tickets/<id>/`): `backend/tickets/views.py`, `backend/tickets/urls.py`
- [x] Filter/search/order newest first: `backend/tickets/views.py`
- [x] Stats endpoint shape + full key coverage + DB aggregation: `backend/tickets/views.py`
- [x] LLM classify endpoint with structured outputs + fallback defaults: `backend/tickets/views.py`, `backend/tickets/llm_prompt.py`
- [x] LLM title suggestion endpoint: `backend/tickets/views.py`, `backend/tickets/services/llm.py`, `backend/tickets/ai_prompts.py`
- [x] Sentiment + urgency AI scoring on create/update text edits: `backend/tickets/views.py`, `backend/tickets/services/llm.py`
- [x] `/api/` URL wiring + admin route: `backend/config/urls.py`
- [x] Frontend responsive layout + form/list/stats UX states: `frontend/src/App.tsx`, `frontend/src/App.css`, `frontend/src/components/*`
- [x] Frontend suggest-title UX + sentiment/urgency badges + extended stats rendering: `frontend/src/components/TicketForm.tsx`, `frontend/src/components/TicketList.tsx`, `frontend/src/components/StatsCard.tsx`
- [x] Frontend API layer: `frontend/src/api.ts`
- [x] Docker DB readiness gating: `docker-compose.yml`
