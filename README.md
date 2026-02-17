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
```

Notes:
- `.env` is gitignored.
- `OPENAI_API_KEY` is optional. If missing or classification fails, classify endpoint returns safe defaults.

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

## Implementation Notes
- Ticket constraints are enforced at DB-level with `CheckConstraint`s.
- Stats use ORM aggregation/annotation only (no per-ticket Python loops).
- Backend applies migrations on container startup.
- Docker startup is hardened with Postgres healthcheck + backend dependency on `service_healthy`.

## Acceptance Checklist
- [x] Ticket model fields + choices + DB constraints: `backend/tickets/models.py`, `backend/tickets/migrations/0001_initial.py`
- [x] Ticket serializer + clean validation: `backend/tickets/serializers.py`
- [x] CRUD endpoints (`POST /api/tickets/`, `GET /api/tickets/`, `PATCH /api/tickets/<id>/`): `backend/tickets/views.py`, `backend/tickets/urls.py`
- [x] Filter/search/order newest first: `backend/tickets/views.py`
- [x] Stats endpoint shape + full key coverage + DB aggregation: `backend/tickets/views.py`
- [x] LLM classify endpoint with structured outputs + fallback defaults: `backend/tickets/views.py`, `backend/tickets/llm_prompt.py`
- [x] `/api/` URL wiring + admin route: `backend/config/urls.py`
- [x] Frontend responsive layout + form/list/stats UX states: `frontend/src/App.tsx`, `frontend/src/App.css`, `frontend/src/components/*`
- [x] Frontend API layer: `frontend/src/api.ts`
- [x] Docker DB readiness gating: `docker-compose.yml`
