import type { Env } from '../types';
import { createReviewIssue } from '../lib/db';

export async function refreshCacheJob(env: Env): Promise<{ ok: boolean; cachedKeys: string[] }> {
  const topCities = await env.DB.prepare(`
    SELECT city, COUNT(*) AS count
    FROM locations
    WHERE publish_status = 'live'
      AND review_status = 'approved'
      AND city IS NOT NULL
    GROUP BY city
    ORDER BY count DESC, city ASC
    LIMIT 50
  `).all();

  const latestImport = await env.DB.prepare(`
    SELECT id, job_name, status, started_at, finished_at, inserted_count, updated_count, skipped_count, error_count
    FROM import_runs
    ORDER BY id DESC
    LIMIT 1
  `).first();

  await env.CACHE.put('stats:topCities', JSON.stringify(topCities.results || []), { expirationTtl: 3600 });
  await env.CACHE.put('stats:lastImportRun', JSON.stringify(latestImport || null), { expirationTtl: 3600 });

  return { ok: true, cachedKeys: ['stats:topCities', 'stats:lastImportRun'] };
}

export async function duplicateAuditJob(env: Env): Promise<{ ok: boolean; candidates: number }> {
  const result = await env.DB.prepare(`
    SELECT a.id AS a_id,
           b.id AS b_id,
           a.retailer_name,
           a.city,
           a.address1
    FROM locations a
    JOIN locations b
      ON a.id < b.id
     AND lower(a.retailer_name) = lower(b.retailer_name)
     AND ifnull(lower(a.city), '') = ifnull(lower(b.city), '')
     AND ifnull(lower(a.address1), '') = ifnull(lower(b.address1), '')
    LIMIT 100
  `).all<Record<string, unknown>>();

  for (const row of result.results || []) {
    const aId = Number(row.a_id);
    await createReviewIssue(env, aId, 'duplicate_candidate', JSON.stringify(row));
  }

  return { ok: true, candidates: (result.results || []).length };
}
