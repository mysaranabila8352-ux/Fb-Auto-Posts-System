# Facebook Post Scheduler

A self-hosted dashboard to create, schedule, and manage automated posts to a Facebook Page.

**Stack:** Node.js + Express · SQLite (Node's built-in `node:sqlite` module) · `node-cron` · vanilla HTML/CSS/JS dashboard.

---

## Features

- Create posts (text + optional image URL) and save them as drafts/scheduled items
- Schedule a post for a **one-time** date/time, or **daily recurring** at a chosen time
- View all upcoming/scheduled posts, with the ability to cancel a pending one
- Posting history (posted / failed, including each run of a daily recurring post)
- Success/failure logs for every attempt, with the Facebook API's error message on failure
- Simple dark "control room" admin dashboard, no build step required

---

## Try it without Facebook first (Mock Mode)

Don't have a Page/token set up yet? You don't need one to try the app. If `FB_PAGE_ID` and `FB_PAGE_ACCESS_TOKEN` are left blank in `.env`, the scheduler automatically runs in **Mock Mode**:

- Every scheduled post "publishes" successfully on schedule, exactly like a real run
- A fake Facebook post ID is generated and logged
- The dashboard shows a **Mock Mode** banner so it's never confused with a live post
- Every other feature — scheduling, daily recurrence, history, success/failure logs — behaves identically to production

Set `MOCK_MODE=true` in `.env` to force it on even after you've added real credentials (handy for testing without touching your real Page).

When you're ready to go live, fill in `FB_PAGE_ID` and `FB_PAGE_ACCESS_TOKEN` (and leave `MOCK_MODE=false`) — the banner disappears and posts start actually publishing.

## 1. Prerequisites (for going live)

- **Node.js 22.5 or newer** (needed for the built-in `node:sqlite` module — no native compilers, Python, or Visual Studio Build Tools required)
- A Facebook Page you manage
- A **Page Access Token** with `pages_manage_posts` and `pages_read_engagement` permissions

### Getting a Page Access Token
1. Go to [Meta for Developers](https://developers.facebook.com/) → create an app (type: **Business**).
2. Add the **Facebook Login for Business** or use **Graph API Explorer** to generate a User Access Token with `pages_show_list`, `pages_manage_posts`, `pages_read_engagement`.
3. Exchange it for a long-lived token, then call `GET /me/accounts` to get your Page's own **Page Access Token** (page tokens derived this way don't expire as long as the user token stays valid).
4. For a production/unattended setup, use a **System User** in Meta Business Suite instead — it gives you a token that doesn't depend on any individual's login session.

---

## 2. Install

```bash
cd fb-scheduler
npm install
cp .env.example .env
```

Edit `.env`:

```
FB_PAGE_ACCESS_TOKEN=your_page_access_token_here
FB_PAGE_ID=your_page_id_here
FB_GRAPH_API_VERSION=v20.0
PORT=3000
SCHEDULER_CRON=* * * * *
```

## 3. Run

```bash
npm start
```

Visit **http://localhost:3000** for the dashboard.

---

## How scheduling works

- A background `node-cron` job (default: every minute — configurable via `SCHEDULER_CRON`) checks the database for:
  - **One-time posts** whose `scheduled_time` has passed and are still `pending`
  - **Daily posts** whose `daily_time` (HH:MM) matches the current minute
- When due, it calls the Facebook Graph API (`/{page-id}/feed` for text, `/{page-id}/photos` for an image + caption).
- Every attempt — success or failure — is written to `post_logs`, visible in the **Success / Failure Logs** tab.
- One-time posts move to `posted` or `failed` after their single run. Daily posts stay `pending` so they fire again the next day; each day's run still gets its own log entry, viewable in **Posting History** and **Logs**.

## Data model (SQLite, file: `db/scheduler.db`)

> You'll see `ExperimentalWarning: SQLite is an experimental feature` in the console when the server starts — that's expected and harmless. It's Node's own built-in SQLite module (added to avoid requiring native build tools like Visual Studio/Python that `better-sqlite3` needs on Windows), and it's fully functional.

- **posts** — `content`, `image_url`, `scheduled_time`, `recurrence` (`once`/`daily`), `daily_time`, `status` (`pending`/`posted`/`failed`), `fb_post_id`, timestamps
- **post_logs** — `post_id`, `attempted_at`, `status` (`success`/`failure`), `message`

## API reference

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/posts` | Create a post |
| GET | `/api/posts?status=pending` | List posts (optional status filter) |
| GET | `/api/posts/:id` | Get one post + its logs |
| PUT | `/api/posts/:id` | Edit a pending post |
| DELETE | `/api/posts/:id` | Cancel/delete a post |
| GET | `/api/history` | Posted/failed posts + all daily posts |
| GET | `/api/logs` | Last 200 success/failure log entries |
| GET | `/api/stats` | Dashboard summary counters |

## Notes & next steps

- This is a **single-admin** tool with no login screen — put it behind a VPN, SSH tunnel, or add basic auth (e.g. `express-basic-auth`) before exposing it publicly.
- Image posting requires a **publicly reachable image URL**; direct file upload isn't wired in but `multer` is already a dependency if you want to add local file upload → hosting later.
- For multi-page support, add a `page_id`/`page_token` column to `posts` and let the dashboard pick a Page per post.
