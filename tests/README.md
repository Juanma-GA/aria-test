# Tests

Test infrastructure uses Vitest (unit + integration, jsdom) and Playwright (e2e).

## Layout

- `tests/unit/` — pure unit tests (no network, no DB). Run in jsdom.
- `tests/integration/` — test API route handlers / DB-aware code via `mongodb-memory-server`.
- `tests/e2e/` — Playwright browser tests against a running Next.js dev server.
- `tests/setup.ts` — jest-dom matchers + React Testing Library cleanup.

## Running

Inside the Docker container (current setup without local Node):

```bash
# unit + integration
docker-compose run --rm --no-deps --entrypoint="" ia-audit sh -c "npx vitest run"

# e2e (needs dev server running or set E2E_SKIP_WEBSERVER and boot separately)
docker-compose run --rm --no-deps --entrypoint="" ia-audit sh -c "npx playwright test"
```

With local Node:

```bash
npm test
npm run test:coverage
npm run test:e2e
```

## Conventions

- Unit tests mirror the source tree: `tests/unit/<area>/<name>.test.ts`.
- Integration tests for API routes call the route handler directly with a mocked `Request`.
- E2E tests assume fixtures are seeded via the admin-guarded `/api/seed` endpoint (see Sprint 1).
