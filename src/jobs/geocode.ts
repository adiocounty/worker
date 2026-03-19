import type { Env } from '../types';

export async function geocodeJob(env: Env): Promise<{ ok: boolean; processed: number; updated: number; errors: number }> {
  const rows = await env.DB.prepare(`
    SELECT id, address1, city, state, postal_code
    FROM locations
    WHERE latitude IS NULL
      AND longitude IS NULL
      AND address1 IS NOT NULL
      AND city IS NOT NULL
      AND review_status IN ('pending', 'approved')
    LIMIT 100
  `).all<{ id: number; address1: string; city: string; state: string; postal_code: string }>();

  let updated = 0;
  let errors = 0;
  const list = rows.results || [];

  for (const row of list) {
    try {
      const query = encodeURIComponent(`${row.address1}, ${row.city}, ${row.state || 'OR'} ${row.postal_code || ''}`);
      const response = await fetch(`${env.GEOCODER_BASE_URL}&q=${query}`, {
        headers: {
          'user-agent': 'hotspots4jackpots-worker/1.0'
        }
      });

      if (!response.ok) {
        throw new Error(`Geocode failed with ${response.status}`);
      }

      const payload = await response.json() as Array<{ lat?: string; lon?: string }>;
      const first = payload[0];
      const latitude = first?.lat ? Number(first.lat) : NaN;
      const longitude = first?.lon ? Number(first.lon) : NaN;

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        errors++;
        continue;
      }

      await env.DB.prepare(`
        UPDATE locations
        SET latitude = ?,
            longitude = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(latitude, longitude, row.id).run();

      updated++;
    } catch {
      errors++;
    }
  }

  return { ok: true, processed: list.length, updated, errors };
}
