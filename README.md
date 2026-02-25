# Support Ticket System

End-to-end support ticket platform with a Django REST backend, React frontend, PostgreSQL, and AI-assisted ticket workflows.

Repository: [https://github.com/maher4real/support-ticket-system](https://github.com/maher4real/support-ticket-system)

## Live URLs

- Frontend (Vercel): `https://support-ticket-system-ai.vercel.app`
- Backend API base (Render): `https://support-ticket-backend-yek7.onrender.com/api/`
- Backend tickets endpoint: `https://support-ticket-backend-yek7.onrender.com/api/tickets/`

## Features

### Core Ticket Management

- Create, list, search, filter, and update tickets
- Status workflow: `open`, `in_progress`, `resolved`, `closed`
- Priority levels: `low`, `medium`, `high`, `critical`
- Category types: `billing`, `technical`, `account`, `general`
- Server-side validation and DB-level integrity checks

### AI Capabilities

- AI category + priority classification from description
- AI title suggestion from ticket description
- AI sentiment + urgency scoring (`0..100`)
- Graceful fallback behavior when OpenAI key/model is missing or unavailable

### Dashboard Analytics

- Total and open ticket counts
- Average tickets per day
- Priority/category/sentiment breakdowns
- Average urgency score
- Implemented with DB-level aggregation (no Python row-loop analytics)

### Production-Ready Deployment Split

- Frontend deployment target: Vercel
- Backend + Postgres deployment target: Render
- Local Docker fallback remains supported for development

## Tech Stack

- Backend: Django 5, Django REST Framework, django-filter
- Frontend: React 19, TypeScript, Vite
- Database: PostgreSQL 15
- AI: OpenAI API (`gpt-4o-mini` default)
- Runtime/Infra: Docker Compose (local), Gunicorn + WhiteNoise (production)

## Project Structure

```text
support-ticket-system/
├── backend/                  # Django API
│   ├── config/               # settings, urls, wsgi/asgi
│   ├── tickets/              # models, serializers, views, AI services
│   └── requirements.txt
├── frontend/                 # React + Vite app
│   ├── src/
│   ├── public/
│   └── vercel.json
├── docker-compose.yml        # local full-stack orchestration
├── render.yaml               # Render Blueprint (backend + Postgres)
└── README.md
```

## Local Development (Docker)

### 1. Configure environment

```bash
cp .env.example .env
```

### 2. Start services

```bash
docker compose up --build
```

### 3. Open locally

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:8000/api/tickets/`
- Stats: `http://localhost:8000/api/tickets/stats/`

## Environment Variables

### Local (`.env`)

Template: `.env.example`

```env
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1,testserver
CORS_ALLOWED_ORIGINS=
CSRF_TRUSTED_ORIGINS=
DATABASE_URL=

POSTGRES_DB=tickets
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_HOST=db
POSTGRES_PORT=5432
OPENAI_API_KEY=
OPENAI_CLASSIFY_MODEL=gpt-4o-mini
OPENAI_TIMEOUT_SECONDS=3.5
OPENAI_MAX_RETRIES=0
```

### Render backend (`backend/.env.render.example`)

```env
DEBUG=False
SECRET_KEY=replace-with-strong-secret
ALLOWED_HOSTS=your-backend-name.onrender.com
CORS_ALLOWED_ORIGINS=https://your-frontend-name.vercel.app
CSRF_TRUSTED_ORIGINS=https://your-frontend-name.vercel.app
DATABASE_URL=postgresql://user:password@host:5432/database
OPENAI_API_KEY=
OPENAI_CLASSIFY_MODEL=gpt-4o-mini
OPENAI_TIMEOUT_SECONDS=3.5
OPENAI_MAX_RETRIES=0
```

Notes:

- `OPENAI_API_KEY` is optional. Core CRUD still works without it.
- `OPENAI_TIMEOUT_SECONDS` controls per-request OpenAI timeout (default `3.5`).
- `OPENAI_MAX_RETRIES` controls OpenAI SDK retries (default `0` to fail fast).
- `CORS_ALLOWED_ORIGINS` and `CSRF_TRUSTED_ORIGINS` must include `https://` and must not include a trailing slash.
- If `DATABASE_URL` is empty in local Docker, backend uses `POSTGRES_*` values.

## Deployment

### Backend on Render (Blueprint)

This repo includes `render.yaml` for backend + Postgres provisioning.

### Steps

1. Render Dashboard -> New -> Blueprint.
2. Select this repository and deploy from `main`.
3. Render creates:
   - Web service: `support-ticket-backend`
   - Postgres database: `support-ticket-db`
4. Set required environment values in Render:
   - `SECRET_KEY`
   - `ALLOWED_HOSTS` (example: `.onrender.com` or exact service host)
   - `CORS_ALLOWED_ORIGINS` (example: `https://your-app.vercel.app`)
   - `CSRF_TRUSTED_ORIGINS` (example: `https://your-app.vercel.app`)
   - `OPENAI_API_KEY` (optional)
   - `OPENAI_TIMEOUT_SECONDS` (optional, default `3.5`)
   - `OPENAI_MAX_RETRIES` (optional, default `0`)
5. Redeploy.
6. Verify:
   - `https://<render-domain>/api/tickets/`
   - `https://<render-domain>/api/tickets/stats/`

### Frontend on Vercel

### Steps

1. Import this repository in Vercel.
2. Set project root directory to `frontend`.
3. Add env var:
   - `VITE_API_BASE_URL=https://<render-domain>`
   - `VITE_API_TIMEOUT_MS=15000` (optional)
4. Deploy/redeploy.
5. Open the site and test ticket flows.

SPA routing support is configured in `frontend/vercel.json`.

## API Reference

Base path: `/api/`

### Create Ticket

- `POST /api/tickets/`

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

### List Tickets

- `GET /api/tickets/`
- Filters: `category`, `priority`, `status`
- Search: `search` (title + description)

```bash
curl "http://localhost:8000/api/tickets/?category=technical&status=open&search=timeout"
```

### Update Ticket

- `PATCH /api/tickets/<id>/`

```bash
curl -X PATCH http://localhost:8000/api/tickets/1/ \
  -H "Content-Type: application/json" \
  -d '{"status":"resolved"}'
```

Behavior:

- Recomputes sentiment/urgency only when `title` or `description` changes.
- Status-only updates keep existing AI scores.

### Stats

- `GET /api/tickets/stats/`

```bash
curl http://localhost:8000/api/tickets/stats/
```

### AI Classify

- `POST /api/tickets/classify/`

```bash
curl -X POST http://localhost:8000/api/tickets/classify/ \
  -H "Content-Type: application/json" \
  -d '{"description":"Production checkout fails with 500 for all users"}'
```

### AI Title Suggestion

- `POST /api/tickets/suggest-title/`

```bash
curl -X POST http://localhost:8000/api/tickets/suggest-title/ \
  -H "Content-Type: application/json" \
  -d '{"description":"Payment was charged twice and invoice totals are incorrect"}'
```

## Testing and Checks

Backend tests:

```bash
docker compose exec backend python manage.py test
```

Frontend checks:

```bash
docker compose exec frontend npm run lint
docker compose exec frontend npm run build
```

## Troubleshooting

- Build passes but health check fails on Render (`400`): verify `ALLOWED_HOSTS`.
- CORS/CSRF errors: ensure origin values include `https://` and have no trailing slash.
- AI endpoints returning fallback values: verify `OPENAI_API_KEY`.
- Intermittent request timeouts during AI calls: reduce `OPENAI_TIMEOUT_SECONDS` and keep `OPENAI_MAX_RETRIES=0`.
- Local DB issues: run migrations again:

```bash
docker compose exec backend python manage.py migrate
```

## Security Notes

- Never commit real secrets.
- `.env` files stay local; use templates for shared setup.
- Rotate production keys regularly.
