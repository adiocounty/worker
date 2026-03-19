import type { Env } from '../types';

export async function createImportRun(env: Env, jobName: string): Promise<number> {
  const row = await env.DB.prepare(`
    INSERT INTO import_runs (job_name, status)
    VALUES (?, 'running')
    RETURNING id
  `).bind(jobName).first<{ id: number }>();

  if (!row) throw new Error('Failed to create import run');
  return row.id;
}

export async function finishImportRun(
  env: Env,
  id: number,
  payload: {
    status: 'success' | 'error';
    inserted: number;
    updated: number;
    skipped: number;
    errors: number;
    notes?: string;
  }
): Promise<void> {
  await env.DB.prepare(`
    UPDATE import_runs
    SET status = ?,
        inserted_count = ?,
        updated_count = ?,
        skipped_count = ?,
        error_count = ?,
        notes = ?,
        finished_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `)
    .bind(
      payload.status,
      payload.inserted,
      payload.updated,
      payload.skipped,
      payload.errors,
      payload.notes || null,
      id
    )
    .run();
}

export async function createReviewIssue(
  env: Env,
  locationId: number,
  reason: string,
  details?: string
): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO review_queue (location_id, reason, details)
    VALUES (?, ?, ?)
  `).bind(locationId, reason, details || null).run();
}
