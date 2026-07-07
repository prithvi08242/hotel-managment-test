# Wayfarer Hotel Management System — Project Documentation

A portfolio project demonstrating an SDET/DevOps CI/CD pipeline across two
separate repositories, built incrementally, page by page.

## Repo structure

| Repo | Purpose | Owner |
|---|---|---|
| `hotel-management-dev` | Application code (backend + frontend). No CI tooling, no test framework. | App code |
| `hotel-managment-test` | All pipeline/test tooling: docker-compose, GitHub Actions, Playwright, live dashboard. | SDET/DevOps |

Rationale: developers own app code; the SDET/DevOps engineer owns
containerization, pipeline, and test infrastructure — contributed via normal
PRs into the dev repo where needed (e.g. Dockerfiles), and living entirely in
the SDET repo otherwise (CI config, E2E specs, dashboard).

---

## `hotel-management-dev`

### Pages built so far
- **Login page** — FastAPI backend (`POST /api/login`, `GET /api/health`),
  React frontend (`LoginPage.jsx`). Uses an **in-memory** user store — no
  database yet. Persistence is added later, once a feature (bookings)
  actually needs relational guarantees.

### Seeded test accounts
| Email | Password | Role |
|---|---|---|
| `guest@w.com` | `guest` | guest |
| `admin@w.com` | `admin` | admin |

### Dockerfiles
- `backend/Dockerfile` — `python:3.11-slim`, installs `requirements.txt`,
  runs `uvicorn app.main:app --host 0.0.0.0 --port 8000`
- `frontend/Dockerfile` — `node:22-alpine`, runs `yarn dev`

### CI pipeline (`.github/workflows/ci.yml`)
Single file, two triggers:

```yaml
on:
  pull_request:
    branches: [main]
  workflow_run:
    workflows: ["ci"]
    types: [completed]
    branches: [main]
```

- `pull_request` → runs `lint`, `backend-test`, `frontend-test` (the go/no-go
  gate before merge). Each job guarded with `if: github.event_name == 'pull_request'`.
- `workflow_run` (fires after this same workflow completes on `main`, i.e.
  post-merge) → runs `build-and-push` only, guarded with
  `if: github.event.workflow_run.conclusion == 'success'`.

This avoids re-running lint/tests a second time after merge — they already
passed during PR review.

```
lint (needs: nothing)
  ├── black --check .        (backend formatting)
  ├── flake8 . --max-line-length=88
  └── yarn eslint src --max-warnings=0

backend-test (needs: lint)
  ├── start FastAPI app in background
  ├── wait for /api/health
  └── pytest tests/api -q

frontend-test (needs: lint)
  └── yarn test --watchAll=false   (Jest, colocated *.test.jsx files)

build-and-push (runs post-merge only, via workflow_run)
  ├── assume AWS IAM role via OIDC (no stored keys)
  ├── log in to ECR
  ├── build & push hms-backend:<sha>
  └── build & push hms-frontend:<sha>
```

### Test coverage
- **API tests** (`tests/api/test_login.py`, pytest + requests): valid login
  (guest/admin), wrong password, unknown email, missing field validation,
  health check.
- **Unit tests** (`frontend/src/pages/LoginPage.test.jsx`, Jest +
  Testing Library): form renders, error state on failed login, success
  state on valid login (API mocked, no real backend needed).

---

## `hotel-managment-test`

### Local dev
`docker-compose.yml` — runs the two images already built locally
(`hms-backend`, `hms-front-img`) together, so the app can be exercised
without juggling two terminals.

### E2E framework
Playwright, `tests/login.spec.js` — two specs so far:
- successful login with valid guest credentials
- error shown on wrong password

Run locally against `docker compose up`: `npx playwright test`

### Live pipeline dashboard
`pipeline-flow.html` — single-page dashboard rendering the **entire**
pipeline (both repos) as one vertical flowchart. Pulls live job + step
status directly from the GitHub Actions API (no webhook, just polling every
5s), color-coded gray/amber/green/red, with per-step durations.

Deployed automatically via `.github/workflows/monitoring-ci.yml` to GitHub
Pages on every push to `main` that touches `pipeline-flow.html`.

**Live URL:** https://prithvi08242.github.io/hotel-managment-test/

---

## AWS setup (in progress)

- **ECR repos created:** `hms-backend`, `hms-frontend`
  (`442729101598.dkr.ecr.us-east-1.amazonaws.com`)
- **IAM OIDC provider:** trusts `token.actions.githubusercontent.com`,
  audience `sts.amazonaws.com`
- **IAM role:** `hms-role`
  (`arn:aws:iam::442729101598:role/hms-role`), scoped to
  `prithvi08242/hotel-management-dev`, permission
  `AmazonEC2ContainerRegistryPowerUser`
- **GitHub secrets set in `hotel-management-dev`:** `AWS_ROLE_ARN`,
  `AWS_REGION`

No long-lived AWS keys are stored anywhere — GitHub Actions assumes the
role at runtime via OIDC, per run.

---

## Full pipeline (target state)

```
Push to feature branch
   ↓
PR opened → hotel-management-dev CI runs (go/no-go gate)
   lint → backend-test + frontend-test (parallel)
   ↓ pass required to merge
Merge to main
   ↓
Build & push images → ECR                [next step]
   ↓
Deploy to staging (EKS)                   [not started]
   ↓
E2E tests run against staging             [currently local-only]
   ↓
Go / no-go gate                           [not started]
   ↓
Deploy to production (HA, self-healing)   [not started]
   ↓
Custom domain (GoDaddy DNS → LB)          [not started]
```

## Roadmap — what's left

1. Push and verify `build-and-push` actually runs post-merge — **current step**
2. Create EKS cluster
3. `deploy-staging` job
4. Wire Playwright E2E into CI, running against the real staging URL
5. Go/no-go gate step
6. `deploy-production` job — multiple replicas, liveness/readiness probes
7. Point a GoDaddy domain at the production load balancer