const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { isMockMode } = require('../facebook');

// ---- App configuration (used by dashboard to show a mock-mode banner) ----
router.get('/config', (req, res) => {
  res.json({ mockMode: isMockMode() });
});

// ---- Create a new post (one-off or daily recurring) ----
router.post('/posts', (req, res) => {
  const { content, image_url, recurrence, scheduled_time, daily_time } = req.body;

  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Post content is required.' });
  }
  if (recurrence === 'daily') {
    if (!daily_time) return res.status(400).json({ error: 'daily_time (HH:MM) is required for daily posts.' });
  } else {
    if (!scheduled_time) return res.status(400).json({ error: 'scheduled_time is required for one-off posts.' });
  }

  const stmt = db.prepare(`
    INSERT INTO posts (content, image_url, scheduled_time, recurrence, daily_time, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `);

  const info = stmt.run(
    content.trim(),
    image_url || null,
    recurrence === 'daily' ? new Date().toISOString() : new Date(scheduled_time).toISOString(),
    recurrence === 'daily' ? 'daily' : 'once',
    recurrence === 'daily' ? daily_time : null
  );

  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(post);
});

// ---- List all posts (optionally filter by status) ----
router.get('/posts', (req, res) => {
  const { status } = req.query;
  const posts = status
    ? db.prepare('SELECT * FROM posts WHERE status = ? ORDER BY created_at DESC').all(status)
    : db.prepare('SELECT * FROM posts ORDER BY created_at DESC').all();
  res.json(posts);
});

// ---- Get a single post with its logs ----
router.get('/posts/:id', (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  const logs = db.prepare('SELECT * FROM post_logs WHERE post_id = ? ORDER BY attempted_at DESC').all(req.params.id);
  res.json({ ...post, logs });
});

// ---- Update a pending post ----
router.put('/posts/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Post not found.' });
  if (existing.status !== 'pending') {
    return res.status(400).json({ error: 'Only pending posts can be edited.' });
  }

  const { content, image_url, recurrence, scheduled_time, daily_time } = req.body;

  db.prepare(`
    UPDATE posts SET
      content = ?,
      image_url = ?,
      recurrence = ?,
      scheduled_time = ?,
      daily_time = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    content ?? existing.content,
    image_url ?? existing.image_url,
    recurrence ?? existing.recurrence,
    (recurrence === 'daily') ? existing.scheduled_time : (scheduled_time ? new Date(scheduled_time).toISOString() : existing.scheduled_time),
    (recurrence === 'daily') ? (daily_time ?? existing.daily_time) : existing.daily_time,
    req.params.id
  );

  const updated = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// ---- Cancel/delete a post ----
router.delete('/posts/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Post not found.' });
  db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ---- Posting history (posted + failed) ----
router.get('/history', (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM posts
    WHERE status IN ('posted', 'failed') OR recurrence = 'daily'
    ORDER BY updated_at DESC
  `).all();
  res.json(rows);
});

// ---- All logs (success/failure), most recent first ----
router.get('/logs', (req, res) => {
  const rows = db.prepare(`
    SELECT post_logs.*, posts.content, posts.recurrence
    FROM post_logs
    JOIN posts ON posts.id = post_logs.post_id
    ORDER BY attempted_at DESC
    LIMIT 200
  `).all();
  res.json(rows);
});

// ---- Dashboard summary stats ----
router.get('/stats', (req, res) => {
  const pending = db.prepare(`SELECT COUNT(*) c FROM posts WHERE status = 'pending'`).get().c;
  const posted = db.prepare(`SELECT COUNT(*) c FROM posts WHERE status = 'posted'`).get().c;
  const failed = db.prepare(`SELECT COUNT(*) c FROM posts WHERE status = 'failed'`).get().c;
  const daily = db.prepare(`SELECT COUNT(*) c FROM posts WHERE recurrence = 'daily'`).get().c;
  const successLogs = db.prepare(`SELECT COUNT(*) c FROM post_logs WHERE status = 'success'`).get().c;
  const failureLogs = db.prepare(`SELECT COUNT(*) c FROM post_logs WHERE status = 'failure'`).get().c;
  res.json({ pending, posted, failed, daily, successLogs, failureLogs });
});

module.exports = router;
