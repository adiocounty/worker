# hotspots4jackpots-worker

Cloudflare Worker backend for `hotspots4jackpots.com`.

## What this project includes

- Public API for location search and detail lookups
- Admin endpoints for sync, review, publish, and geocode jobs
- D1 schema + migrations
- Cron-triggered jobs
- Retailer import pipeline with source parsing isolated in one module
- Review queue for low-confidence or duplicate candidates
- Short-term KV caching for summary data

## Deploy flow

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create the D1 database:
   ```bash
   npx wrangler d1 create hotspots4jackpots
   ```
3. Copy the returned `database_id` into `wrangler.jsonc`.
4. Create the KV namespace:
   ```bash
   npx wrangler kv namespace create CACHE
   ```
5. Copy the returned KV namespace ID into `wrangler.jsonc`.
6. Copy `.dev.vars.example` to `.dev.vars` for local development.
7. Apply migrations:
   ```bash
   npm run db:migrate:remote
   ```
8. Generate type bindings:
   ```bash
   npm run cf-typegen
   ```
9. Deploy:
   ```bash
   npm run deploy
   ```

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

Test scheduled jobs locally:

```bash
npm run dev:scheduled
```

## Production notes

- `scheduled()` is wired to four cron expressions in `wrangler.jsonc`.
- Cron expressions are UTC. Adjust when Pacific time moves between PST and PDT.
- The source parser is in `src/lib/source-parser.ts`. If the upstream page changes, you only need to update that file.
- Do not auto-publish uncertain rows. The Worker already routes low-confidence and duplicate candidates into `review_queue`.

## Main endpoints

### Public

- `GET /api/health`
- `GET /api/locations?city=Portland&limit=50`
- `GET /api/locations/:id`
- `GET /api/search?q=salem`
- `GET /api/stats/top-cities`

### Admin

Use `Authorization: Bearer <ADMIN_TOKEN>`.

- `POST /admin/run/sync-retailers`
- `POST /admin/run/geocode`
- `POST /admin/run/audit-duplicates`
- `GET /admin/review/open`
- `POST /admin/review/:id/approve`
- `POST /admin/review/:id/reject`
- `POST /admin/location/:id/publish`
- `POST /admin/location/:id/hide`

## Import behavior

The import job fetches the configured source page, extracts retailer-like records, normalizes them, calculates a deterministic `source_key`, upserts into D1, and queues uncertain records for review.

The parser supports multiple patterns:

- JSON embedded in `<script>` tags
- HTML data attributes for location cards
- Generic address block matching as a fallback

That keeps the rest of the system stable even if the source HTML changes.
