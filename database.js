const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = path.join(__dirname, 'scheduler.db');
const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// ---- Schema ----
db.exec(`
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  image_url TEXT,
  scheduled_time TEXT NOT NULL,     -- ISO datetime string for the single/first run
  recurrence TEXT NOT NULL DEFAULT 'once', -- 'once' or 'daily'
  daily_time TEXT,                  -- HH:MM, used when recurrence = 'daily'
  status TEXT NOT NULL DEFAULT 'pending', -- pending | posted | failed | cancelled
  fb_post_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS post_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  attempted_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL,             -- success | failure
  message TEXT,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_scheduled_time ON posts(scheduled_time);
CREATE INDEX IF NOT EXISTS idx_logs_post_id ON post_logs(post_id);
`);

module.exports = db;
