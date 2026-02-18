# Support Ticket System

An end-to-end Support Ticket System built with Django REST Framework, React (Vite), PostgreSQL, and Docker Compose.

This project supports:
- Ticket creation, listing, filtering, search, and status updates
- DB-level enforced constraints for all enum/range fields
- AI-powered category/priority classification
- AI-powered title suggestion
- AI-powered sentiment + urgency scoring
- Live stats dashboard using DB-level aggregation (no Python row loops)

## Tech Stack
- Backend: Django 5 + Django REST Framework + django-filter
- Database: PostgreSQL 15
- Frontend: React + TypeScript + Vite
- AI: OpenAI API (`gpt-4o-mini` by default, configurable)
- Infra: Docker + Docker Compose

## Architecture
- `backend/`: Django project (`config`) + app (`tickets`)
- `frontend/`: React app (Vite)
- `docker-compose.yml`: local multi-service orchestration

Main backend files:
- `backend/tickets/models.py` (Ticket schema + DB constraints)
- `backend/tickets/views.py` (API endpoints)
- `backend/tickets/serializers.py` (validation + API shapes)
- `backend/tickets/services/llm.py` (AI integration, strict schema, fallbacks)
- `backend/tickets/llm_prompt.py` (classify prompt)
- `backend/tickets/ai_prompts.py` (title + sentiment/urgency prompts)

## Quick Start
### 1) Configure env
Use the included template:

```bash
cp .env.example .env
```

Then edit `.env` as needed.

### 2) Run the full stack

```bash
docker compose up --build
```

### 3) Open the app
- Frontend: [http://localhost:5173](http://localhost:5173)
- Backend API root: [http://localhost:8000/api/tickets/](http://localhost:8000/api/tickets/)
- Stats endpoint: [http://localhost:8000/api/tickets/stats/](http://localhost:8000/api/tickets/stats/)

These links work once `docker compose up --build` is running successfully.

## Environment Variables
Set in `.env` (and consumed by Docker Compose):

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
- `OPENAI_API_KEY` is optional for local run.
- If key is missing/unreachable, AI endpoints gracefully fallback and core ticket operations still work.
- No secrets are hardcoded in source.

## Docker Behavior
`docker-compose.yml` includes:
- `db` healthcheck with `pg_isready`
- `backend` depends on healthy DB
- backend startup runs migrations automatically before server start
- fixed required ports:
  - DB: `5432`
  - Backend: `8000`
  - Frontend: `5173`

## API Reference
All APIs are under `/api/`.

### 1) Create Ticket
`POST /api/tickets/`

Creates a ticket.

Request:
```bash
curl -X POST http://localhost:8000/api/tickets/ \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Cannot login",
    "description": "Users cannot login after password reset",
    "category": "account",
    "priority": "high"
  }'
```

Response: `201 Created` with ticket JSON (includes `sentiment` and `urgency_score`).

### 2) List Tickets
`GET /api/tickets/`

Supports:
- `?category=`
- `?priority=`
- `?status=`
- `?search=` (searches title + description)

Example:
```bash
curl "http://localhost:8000/api/tickets/?category=technical&status=open&search=timeout"
```

Response: `200 OK`, newest first.

### 3) Update Ticket
`PATCH /api/tickets/<id>/`

Example:
```bash
curl -X PATCH http://localhost:8000/api/tickets/1/ \
  -H "Content-Type: application/json" \
  -d '{"status":"resolved"}'
```

Response: `200 OK`.

AI signal recompute rule:
- Recomputes sentiment/urgency only if `title` or `description` changed.
- Status-only patch keeps existing AI scores.

### 4) Stats
`GET /api/tickets/stats/`

Example:
```bash
curl http://localhost:8000/api/tickets/stats/
```

Response always includes required shape:
```json
{
  "total_tickets": 0,
  "open_tickets": 0,
  "avg_tickets_per_day": 0.0,
  "priority_breakdown": {
    "low": 0,
    "medium": 0,
    "high": 0,
    "critical": 0
  },
  "category_breakdown": {
    "billing": 0,
    "technical": 0,
    "account": 0,
    "general": 0
  }
}
```

Extended fields also included:
- `sentiment_breakdown`
- `avg_urgency_score`

Implementation uses DB aggregation/annotation (`aggregate`, `annotate`, `TruncDate`, `Avg`, `Count`) and does not loop over ticket rows in Python.

### 5) Classify Description (AI)
`POST /api/tickets/classify/`

Request:
```bash
curl -X POST http://localhost:8000/api/tickets/classify/ \
  -H "Content-Type: application/json" \
  -d '{"description":"Production checkout fails with 500 for all users"}'
```

Response:
```json
{
  "suggested_category": "technical",
  "suggested_priority": "critical"
}
```

Fallback (if no key/API failure/invalid output):
```json
{
  "suggested_category": "general",
  "suggested_priority": "low"
}
```

### 6) Suggest Title (AI)
`POST /api/tickets/suggest-title/`

Request:
```bash
curl -X POST http://localhost:8000/api/tickets/suggest-title/ \
  -H "Content-Type: application/json" \
  -d '{"description":"Payment was charged twice and invoice totals are incorrect"}'
```

Response:
```json
{
  "suggested_title": "Duplicate Billing and Incorrect Invoice Totals"
}
```

Rules:
- non-empty string
- preferred short title
- max length enforced in backend

Fallback:
- first sentence trimmed to short length
- or `"Support request"`

## Data Model + Constraints
Ticket fields:
- `title`: required, max 200
- `description`: required
- `category`: `billing|technical|account|general`
- `priority`: `low|medium|high|critical`
- `status`: `open|in_progress|resolved|closed` (default `open`)
- `sentiment`: `calm|neutral|frustrated|angry` (default `neutral`)
- `urgency_score`: integer `0..100` (default `50`)
- `created_at`: auto timestamp

DB-level checks are enforced using Django `CheckConstraint` migrations.

## AI Integration Details
Provider/model:
- OpenAI via env var key
- default model: `gpt-4o-mini` (override with `OPENAI_CLASSIFY_MODEL`)

Reliability behavior:
- Structured outputs via JSON schema (`strict: true`)
- server-side validation after model response
- timeout + exception handling in all AI service calls
- safe fallbacks for every AI feature
- ticket creation/update never fails due to AI issues

Prompt files:
- classify prompt: `backend/tickets/llm_prompt.py`
- title/sentiment prompts: `backend/tickets/ai_prompts.py`

## Frontend UX Summary
- Responsive 2-column desktop layout, stacked mobile layout
- Ticket form:
  - title + description required
  - category/priority dropdowns
  - AI classify while typing description (debounced)
  - AI title generation action with non-destructive apply behavior
- Ticket list:
  - newest first
  - filter/search controls
  - status quick update per ticket
  - sentiment + urgency badges
- Stats card:
  - total/open/avg per day
  - priority/category breakdown
  - sentiment breakdown + average urgency score

## Quality + Tests
Backend tests:
```bash
docker compose exec backend python manage.py test
```

Frontend checks:
```bash
docker compose exec frontend npm run lint
docker compose exec frontend npm run build
```

## Requirement Coverage Map
- Model + DB constraints: `backend/tickets/models.py`, `backend/tickets/migrations/0001_initial.py`, `backend/tickets/migrations/0002_ticket_ai_signals.py`
- CRUD + filters + search + ordering: `backend/tickets/views.py`
- Stats aggregation (DB-level): `backend/tickets/views.py`
- AI classify/title/sentiment services: `backend/tickets/services/llm.py`
- Prompt files: `backend/tickets/llm_prompt.py`, `backend/tickets/ai_prompts.py`
- Frontend API layer: `frontend/src/api.ts`
- Frontend UI components: `frontend/src/components/*`, `frontend/src/App.tsx`, `frontend/src/App.css`
- Docker readiness + env wiring: `docker-compose.yml`, `backend/Dockerfile`

## Troubleshooting
- If ports are already in use, stop conflicting services and re-run compose.
- If AI suggestions return fallback values, verify `OPENAI_API_KEY` in `.env` and restart containers.
- If DB schema mismatch appears, run:
  ```bash
  docker compose exec backend python manage.py migrate
  ```

## Security Notes
- Do not commit real API keys.
- `.env` is ignored in git.
- Use `.env.example` for shared configuration template.
