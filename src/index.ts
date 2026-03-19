import type { Env } from './types';
import { isAdmin } from './lib/auth';
import { json, notFound, unauthorized, badRequest } from './lib/http';
import { syncRetailersJob } from './jobs/syncRetailers';
import { geocodeJob } from './jobs/geocode';
import { refreshCacheJob, duplicateAuditJob } from './jobs/maintenance';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      const url = new URL(request.url);
      const { pathname } = url;

      if (request.method === 'GET' && pathname === '/api/health') {
        return json({ ok: true, service: 'hotspots4jackpots-worker', now: new Date().toISOString() });
      }

      if (request.method === 'GET' && pathname === '/api/locations') {
        return listLocations(env, url);
      }

      if (request.method === 'GET' && pathname.startsWith('/api/locations/')) {
        const id = pathname.split('/').pop();
        if (!id) return notFound();
        return getLocation(env, id);
      }

      if (request.method === 'GET' && pathname === '/api/search') {
        return searchLocations(env, url);
      }

      if (request.method === 'GET' && pathname === '/api/stats/top-cities') {
        return topCities(env);
      }

      if (pathname.startsWith('/admin/')) {
        if (!isAdmin(request, env)) return unauthorized();

        if (request.method === 'POST' && pathname === '/admin/run/sync-retailers') {
          return json(await syncRetailersJob(env));
        }

        if (request.method === 'POST' && pathname === '/admin/run/geocode') {
          return json(await geocodeJob(env));
        }

        if (request.method === 'POST' && pathname === '/admin/run/audit-duplicates') {
          return json(await duplicateAuditJob(env));
        }

        if (request.method === 'GET' && pathname === '/admin/review/open') {
          return getOpenReviewQueue(env);
        }

        if (request.method === 'POST' && pathname.match(/^\/admin\/review\/\d+\/approve$/)) {
          const id = pathname.split('/')[3];
          return approveLocation(env, id);
        }

        if (request.method === 'POST' && pathname.match(/^\/admin\/review\/\d+\/reject$/)) {
          const id = pathname.split('/')[3];
          return rejectLocation(env, id);
        }

        if (request.method === 'POST' && pathname.match(/^\/admin\/location\/\d+\/publish$/)) {
          const id = pathname.split('/')[3];
          return setPublishStatus(env, id, 'live');
        }

        if (request.method === 'POST' && pathname.match(/^\/admin\/location\/\d+\/hide$/)) {
          const id = pathname.split('/')[3];
          return setPublishStatus(env, id, 'hidden');
        }
      }

      return notFound();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return json({ error: 'internal_error', message }, 500);
    }
  },

  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    switch (event.cron) {
      case '10 11 * * *':
        ctx.waitUntil(syncRetailersJob(env).then((r) => console.log('syncRetailers', r)));
        break;
      case '40 11 * * *':
        ctx.waitUntil(geocodeJob(env).then((r) => console.log('geocodeJob', r)));
        break;
      case '0 * * * *':
        ctx.waitUntil(refreshCacheJob(env).then((r) => console.log('refreshCacheJob', r)));
        break;
      case '15 10 * * 0':
        ctx.waitUntil(duplicateAuditJob(env).then((r) => console.log('duplicateAuditJob', r)));
        break;
      default:
        console.log('Unhandled cron', event.cron);
    }
  }
};

async function listLocations(env: Env, url: URL): Promise<Response> {
  const city = url.searchParams.get('city');
  const limit = Math.min(Number(url.searchParams.get('limit') || '50'), 200);
  if (!Number.isFinite(limit) || limit <= 0) return badRequest('invalid limit');

  const binds: unknown[] = [];
  let sql = `
    SELECT id, retailer_name, city, state, postal_code, latitude, longitude,
           has_video_lottery, has_video_poker
    FROM locations
    WHERE publish_status = 'live'
      AND review_status = 'approved'
  `;

  if (city) {
    sql += ' AND city = ?';
    binds.push(city);
  }

  sql += ' ORDER BY city ASC, retailer_name ASC LIMIT ?';
  binds.push(limit);

  const result = await env.DB.prepare(sql).bind(...binds).all();
  return json({ results: result.results || [] });
}

async function getLocation(env: Env, id: string): Promise<Response> {
  const row = await env.DB.prepare(`
    SELECT id, retailer_name, address1, city, state, postal_code, latitude, longitude,
           has_video_lottery, has_video_poker, source_url, source_name, updated_at
    FROM locations
    WHERE id = ?
      AND publish_status = 'live'
      AND review_status = 'approved'
    LIMIT 1
  `).bind(id).first();

  if (!row) return notFound();
  return json(row);
}

async function searchLocations(env: Env, url: URL): Promise<Response> {
  const q = (url.searchParams.get('q') || '').trim();
  if (!q) return badRequest('missing q');

  const like = `%${q}%`;
  const result = await env.DB.prepare(`
    SELECT id, retailer_name, city, state, postal_code, latitude, longitude,
           has_video_lottery, has_video_poker
    FROM locations
    WHERE publish_status = 'live'
      AND review_status = 'approved'
      AND (
        retailer_name LIKE ?
        OR address1 LIKE ?
        OR city LIKE ?
        OR postal_code LIKE ?
      )
    ORDER BY retailer_name ASC
    LIMIT 50
  `).bind(like, like, like, like).all();

  return json({ results: result.results || [] });
}

async function topCities(env: Env): Promise<Response> {
  const cached = await env.CACHE.get('stats:topCities');
  if (cached) {
    return json({ results: JSON.parse(cached), cache: 'hit' }, 200, { 'cache-control': 'public, max-age=300' });
  }

  const result = await env.DB.prepare(`
    SELECT city, COUNT(*) AS count
    FROM locations
    WHERE publish_status = 'live'
      AND review_status = 'approved'
      AND city IS NOT NULL
    GROUP BY city
    ORDER BY count DESC, city ASC
    LIMIT 50
  `).all();

  await env.CACHE.put('stats:topCities', JSON.stringify(result.results || []), { expirationTtl: 3600 });
  return json({ results: result.results || [], cache: 'miss' }, 200, { 'cache-control': 'public, max-age=300' });
}

async function getOpenReviewQueue(env: Env): Promise<Response> {
  const result = await env.DB.prepare(`
    SELECT rq.id,
           rq.location_id,
           rq.reason,
           rq.details,
           rq.created_at,
           l.retailer_name,
           l.address1,
           l.city,
           l.postal_code,
           l.confidence_score,
           l.review_status,
           l.publish_status
    FROM review_queue rq
    JOIN locations l ON l.id = rq.location_id
    WHERE rq.status = 'open'
    ORDER BY rq.created_at DESC
    LIMIT 200
  `).all();

  return json({ results: result.results || [] });
}

async function approveLocation(env: Env, id: string): Promise<Response> {
  await env.DB.prepare(`
    UPDATE locations
    SET review_status = 'approved',
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(id).run();

  await env.DB.prepare(`
    UPDATE review_queue
    SET status = 'resolved',
        resolved_at = CURRENT_TIMESTAMP
    WHERE location_id = ? AND status = 'open'
  `).bind(id).run();

  return json({ ok: true, id, review_status: 'approved' });
}

async function rejectLocation(env: Env, id: string): Promise<Response> {
  await env.DB.prepare(`
    UPDATE locations
    SET review_status = 'rejected',
        publish_status = 'hidden',
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(id).run();

  await env.DB.prepare(`
    UPDATE review_queue
    SET status = 'resolved',
        resolved_at = CURRENT_TIMESTAMP
    WHERE location_id = ? AND status = 'open'
  `).bind(id).run();

  return json({ ok: true, id, review_status: 'rejected', publish_status: 'hidden' });
}

async function setPublishStatus(env: Env, id: string, status: 'live' | 'hidden'): Promise<Response> {
  await env.DB.prepare(`
    UPDATE locations
    SET publish_status = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(status, id).run();

  return json({ ok: true, id, publish_status: status });
}
