PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_key TEXT NOT NULL UNIQUE,
  retailer_name TEXT NOT NULL,
  address1 TEXT,
  city TEXT,
  state TEXT NOT NULL DEFAULT 'OR',
  postal_code TEXT,
  latitude REAL,
  longitude REAL,
  has_video_lottery INTEGER NOT NULL DEFAULT 0,
  has_video_poker INTEGER NOT NULL DEFAULT 0,
  source_url TEXT,
  source_name TEXT NOT NULL DEFAULT 'oregon_lottery',
  raw_payload TEXT,
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'approved', 'rejected')),
  publish_status TEXT NOT NULL DEFAULT 'draft' CHECK (publish_status IN ('draft', 'live', 'hidden')),
  confidence_score REAL NOT NULL DEFAULT 0.0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_locations_city ON locations(city);
CREATE INDEX IF NOT EXISTS idx_locations_publish_status ON locations(publish_status);
CREATE INDEX IF NOT EXISTS idx_locations_review_status ON locations(review_status);
CREATE INDEX IF NOT EXISTS idx_locations_name_city ON locations(retailer_name, city);
CREATE INDEX IF NOT EXISTS idx_locations_lat_lng ON locations(latitude, longitude);

CREATE TABLE IF NOT EXISTS import_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_name TEXT NOT NULL,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'error')),
  inserted_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS review_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_review_open ON review_queue(status, created_at);

CREATE TABLE IF NOT EXISTS winner_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_name TEXT,
  won_at_location_id INTEGER,
  won_amount INTEGER,
  event_date TEXT,
  source_url TEXT,
  raw_payload TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (won_at_location_id) REFERENCES locations(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
