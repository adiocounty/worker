# Deploy checklist

## 1) Create resources

```bash
npx wrangler d1 create hotspots4jackpots
npx wrangler kv namespace create CACHE
```

## 2) Edit `wrangler.jsonc`

Replace:

- `REPLACE_WITH_D1_DATABASE_ID`
- `REPLACE_WITH_KV_NAMESPACE_ID`
- `REPLACE_WITH_LONG_RANDOM_TOKEN`

## 3) Set secrets if you move admin auth out of `vars`

```bash
npx wrangler secret put ADMIN_TOKEN
```

If you do that, remove `ADMIN_TOKEN` from `vars`.

## 4) Apply migrations

```bash
npx wrangler d1 migrations apply DB --remote
```

## 5) Deploy

```bash
npx wrangler deploy
```

## 6) Smoke test

```bash
curl https://your-worker-or-domain/api/health
curl -H "Authorization: Bearer YOUR_TOKEN" -X POST https://your-worker-or-domain/admin/run/sync-retailers
curl https://your-worker-or-domain/api/stats/top-cities
```

## 7) Attach custom domain

Attach your Worker to the route or custom domain serving `hotspots4jackpots.com` in Cloudflare.
