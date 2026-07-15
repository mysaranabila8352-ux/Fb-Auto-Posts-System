const cron = require('node-cron');
const db = require('./db/database');
const { publishPost } = require('./facebook');

const CRON_EXPR = process.env.SCHEDULER_CRON || '* * * * *'; // every minute by default

function pad(n) {
  return String(n).padStart(2, '0');
}

function nowParts() {
  const d = new Date();
  return {
    iso: d.toISOString(),
    hhmm: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    dateOnly: d.toISOString().slice(0, 10)
  };
}

function logAttempt(postId, status, message) {
  db.prepare(
    `INSERT INTO post_logs (post_id, status, message) VALUES (?, ?, ?)`
  ).run(postId, status, message || null);
}

async function processPost(post) {
  const result = await publishPost({ content: post.content, imageUrl: post.image_url });

  if (result.success) {
    const prefix = result.mock ? '[MOCK] Simulated publish (no real FB call made).' : 'Published.';
    logAttempt(post.id, 'success', `${prefix} FB post id: ${result.fbPostId}`);

    if (post.recurrence === 'daily') {
      // Keep it pending so it fires again tomorrow at the same daily_time;
      // just record the last run info via fb_post_id/updated_at.
      db.prepare(
        `UPDATE posts SET fb_post_id = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(result.fbPostId, post.id);
    } else {
      db.prepare(
        `UPDATE posts SET status = 'posted', fb_post_id = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(result.fbPostId, post.id);
    }
  } else {
    logAttempt(post.id, 'failure', result.error);

    if (post.recurrence !== 'daily') {
      db.prepare(
        `UPDATE posts SET status = 'failed', updated_at = datetime('now') WHERE id = ?`
      ).run(post.id);
    }
    // For daily posts, leave status as-is so it retries tomorrow too.
  }
}

// Tracks which posts already ran in the current minute, to avoid double-firing
// if the check overlaps a minute boundary.
const firedThisMinute = new Set();

async function tick() {
  const { iso, hhmm, dateOnly } = nowParts();

  console.log ("Scheduler Check:", iso, hhmm);
  const minuteKey = iso.slice(0, 16); // YYYY-MM-DDTHH:MM

  // 1) One-off posts whose scheduled_time has arrived and are still pending
  const duePosts = db.prepare(
    `SELECT * FROM posts
     WHERE status = 'pending' AND recurrence = 'once' AND scheduled_time <= ?`
  ).all(iso);

  // 2) Daily posts whose daily_time (HH:MM) matches the current minute
  const dueDaily = db.prepare(
    `SELECT * FROM posts
     WHERE status = 'pending' AND recurrence = 'daily' AND daily_time = ?`
  ).all(hhmm);

  console.log("Current scheduler time:",hhmm);
  console.;og("Daily posts found:",dueDaily);

  const toRun = [...duePosts, ...dueDaily].filter(p => {
    const fireKey = `${p.id}:${minuteKey}`;
    if (firedThisMinute.has(fireKey)) return false;
    firedThisMinute.add(fireKey);
    return true;
  });

  // Clean up old fire-keys occasionally so the Set doesn't grow forever
  if (firedThisMinute.size > 2000) firedThisMinute.clear();

  for (const post of toRun) {
    await processPost(post);
  }
}

function start() {
  console.log(`[scheduler] Starting cron job with expression "${CRON_EXPR}"`);
  cron.schedule(CRON_EXPR, () => {
    tick().catch(err => console.error('[scheduler] tick error:', err));
  });
  // Run one immediate check on boot too
  tick().catch(err => console.error('[scheduler] initial tick error:', err));
}

module.exports = { start, tick };
