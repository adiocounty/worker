import type { Env, ImportRunResult, RetailerCandidate } from '../types';
import { computeConfidence, normalizeCandidate, buildSourceKey } from '../lib/normalize';
import { createImportRun, finishImportRun, createReviewIssue } from '../lib/db';
import { extractRetailersFromHtml } from '../lib/source-parser';

export async function syncRetailersJob(env: Env): Promise<ImportRunResult> {
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  const importRunId = await createImportRun(env, 'syncRetailers');

  try {
    if (env.SOURCE_FETCH_ENABLED !== 'true') {
      throw new Error('SOURCE_FETCH_ENABLED is not true');
    }

    const response = await fetch(env.RETAILER_SOURCE_URL, {
      headers: {
        'user-agent': 'hotspots4jackpots-worker/1.0',
        'accept': 'text/html,application/xhtml+xml'
      }
    });

    if (!response.ok) {
      throw new Error(`Source fetch failed with ${response.status}`);
    }

    const html = await response.text();
    const candidates = extractRetailersFromHtml(html, env.RETAILER_SOURCE_URL, env.SOURCE_NAME);

    for (const candidate of candidates) {
      try {
        const normalized = normalizeCandidate(candidate);
        if (!isUsable(normalized)) {
          skipped++;
          continue;
        }

        const confidence = computeConfidence(normalized);
        const sourceKey = buildSourceKey(normalized);
        const rawPayload = typeof normalized.raw === 'string' ? normalized.raw : JSON.stringify(normalized.raw || null);

        const existing = await env.DB.prepare(`
          SELECT id, confidence_score
          FROM locations
          WHERE source_key = ?
          LIMIT 1
        `).bind(sourceKey).first<{ id: number; confidence_score: number }>();

        if (existing) {
          await env.DB.prepare(`
            UPDATE locations
            SET retailer_name = ?,
                address1 = ?,
                city = ?,
                state = ?,
                postal_code = ?,
                has_video_lottery = ?,
                has_video_poker = ?,
                source_url = ?,
                source_name = ?,
                raw_payload = ?,
                confidence_score = ?,
                updated_at = CURRENT_TIMESTAMP,
                last_seen_at = CURRENT_TIMESTAMP
            WHERE source_key = ?
          `).bind(
            normalized.retailer_name,
            normalized.address1 || null,
            normalized.city || null,
            normalized.state || 'OR',
            normalized.postal_code || null,
            normalized.has_video_lottery ? 1 : 0,
            normalized.has_video_poker ? 1 : 0,
            normalized.source_url || env.RETAILER_SOURCE_URL,
            normalized.source_name || env.SOURCE_NAME,
            rawPayload,
            confidence,
            sourceKey
          ).run();

          if (confidence < 0.70) {
            await createReviewIssue(env, existing.id, 'low_confidence_update', rawPayload);
          }
          updated++;
        } else {
          const created = await env.DB.prepare(`
            INSERT INTO locations (
              source_key,
              retailer_name,
              address1,
              city,
              state,
              postal_code,
              has_video_lottery,
              has_video_poker,
              source_url,
              source_name,
              raw_payload,
              confidence_score,
              review_status,
              publish_status,
              last_seen_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'draft', CURRENT_TIMESTAMP)
            RETURNING id
          `).bind(
            sourceKey,
            normalized.retailer_name,
            normalized.address1 || null,
            normalized.city || null,
            normalized.state || 'OR',
            normalized.postal_code || null,
            normalized.has_video_lottery ? 1 : 0,
            normalized.has_video_poker ? 1 : 0,
            normalized.source_url || env.RETAILER_SOURCE_URL,
            normalized.source_name || env.SOURCE_NAME,
            rawPayload,
            confidence
          ).first<{ id: number }>();

          if (!created) throw new Error('Insert did not return an ID');

          if (confidence < 0.90) {
            await createReviewIssue(env, created.id, 'new_import_review', rawPayload);
          }
          inserted++;
        }
      } catch (error) {
        errors++;
      }
    }

    await finishImportRun(env, importRunId, {
      status: 'success',
      inserted,
      updated,
      skipped,
      errors
    });

    return { ok: true, inserted, updated, skipped, errors };
  } catch (error) {
    const notes = error instanceof Error ? error.message : String(error);
    await finishImportRun(env, importRunId, {
      status: 'error',
      inserted,
      updated,
      skipped,
      errors: errors + 1,
      notes
    });
    return { ok: false, inserted, updated, skipped, errors: errors + 1, notes };
  }
}

function isUsable(candidate: RetailerCandidate): boolean {
  return Boolean(candidate.retailer_name && (candidate.address1 || candidate.city));
}
