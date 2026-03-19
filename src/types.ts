export interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  ADMIN_TOKEN: string;
  APP_BASE_URL: string;
  RETAILER_SOURCE_URL: string;
  GEOCODER_BASE_URL: string;
  SOURCE_NAME: string;
  SOURCE_FETCH_ENABLED: string;
}

export interface RetailerCandidate {
  retailer_name: string;
  address1?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  has_video_lottery?: boolean;
  has_video_poker?: boolean;
  source_url?: string;
  source_name?: string;
  raw?: Record<string, unknown> | string;
}

export interface ImportRunResult {
  ok: boolean;
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
  notes?: string;
}
