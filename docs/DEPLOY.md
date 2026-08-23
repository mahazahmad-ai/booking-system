# Deploying

Two steps: push to GitHub, then import into Vercel.

---

## 1. Log in to GitHub CLI

`gh` is installed but not authenticated. Run this in your terminal:

```powershell
gh auth login
```

Answer: **GitHub.com** → **HTTPS** → **Y** (authenticate Git with your GitHub credentials)
→ **Login with a web browser**. Copy the one-time code it shows, press Enter, paste the code
in the browser.

Verify:

```powershell
gh auth status
```

Then tell me, and I'll create the repository and push.

---

## 2. Import into Vercel

Do this in the browser rather than the CLI — the dashboard sets up the Git integration and
automatic deploys in one pass.

1. Go to **vercel.com/new**
2. **Import** the `booking-system` repository
3. Framework preset should auto-detect **Next.js**. Leave build settings alone.
4. **Before clicking Deploy**, expand **Environment Variables** and add the seven below.

### Environment variables

Copy these from your local `.env` — it already holds the real values.

| Name | Where to get it | Notes |
|---|---|---|
| `DATABASE_URL` | `.env` | The **pooled** Neon string (host contains `-pooler`) |
| `DIRECT_URL` | `.env` | The **unpooled** string. Used by migrations only |
| `AUTH_SECRET` | `.env` | 32 random bytes, already generated |
| `AUTH_URL` | *type it* | Your Vercel URL, e.g. `https://booking-system.vercel.app` |
| `NEXT_PUBLIC_SITE_URL` | *type it* | Same URL. Used in emails and the sitemap |
| `CRON_SECRET` | `.env` | Already generated. Cron routes return 503 without it |
| `RESEND_API_KEY` | resend.com | Leave blank to deploy; email records `SKIPPED` until set |
| `EMAIL_FROM` | *type it* | e.g. `Bookings <bookings@yourdomain.com>` |

> **Do not paste `.env` into a chat, an issue, or a commit.** The file is gitignored; keep
> it that way.

### ⚠️ Pin the function region

**Project → Settings → Functions → Function Region → `sin1` (Singapore)**

`vercel.json` already declares `"regions": ["sin1"]`, but confirm it in settings. Vercel
defaults new projects to `iad1` (Washington DC). With the database in Singapore, that turns
a ~2 ms round trip into ~240 ms — enough on its own to miss the NFR-1 target.

---

## 3. After the first deploy

### Migrations

The build does **not** run migrations. The schema is already applied to your Neon database,
so the first deploy works as-is. For future schema changes, run locally against the direct
connection before deploying:

```powershell
npm run db:deploy
```

### Change the admin password

The seeded password (`ChangeMe123!`) is in the git history and in this repo's README. Before
anyone real uses this:

```powershell
npx tsx --env-file=.env scripts/set-password.ts owner@noorwellness.example
```

### Verify cron

Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically. To test by hand:

```powershell
curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://your-app.vercel.app/api/cron/close-out
```

Without the header it must return **401**; without `CRON_SECRET` set at all, **503**. Both
are deliberate — an unset secret must never mean "let everyone in".

On the **Hobby** plan cron runs once a day and may fire anywhere inside the scheduled hour,
which is why reminders are a morning digest rather than an exact 24-hour ping. On **Pro**,
tighten both schedules in `vercel.json` to hourly.

### Send one real email

Until a confirmation lands in an inbox, that subsystem is verified in code only. Add
`RESEND_API_KEY`, make a test booking, and check `/admin/bookings/[id]` — the Emails panel
shows `sent` or `failed` per message.

Resend's default sending domain will land in spam for a meaningful share of recipients. Add
**SPF, DKIM and DMARC** on your sending subdomain; DNS takes hours to propagate, so start it
before you need it.

---

---

## About `vercel.json`

It is deliberately minimal, because Vercel validates it against a strict schema and
rejects unknown properties — a rejected file fails the deployment in about a second,
before the build starts, which looks nothing like a build error.

```json
{
  "regions": ["sin1"],
  "crons": [
    { "path": "/api/cron/reminders", "schedule": "0 3 * * *" },
    { "path": "/api/cron/close-out",  "schedule": "0 22 * * *" }
  ]
}
```

Cron entries accept **only** `path` and `schedule`. JSON has no comment syntax, so the
reasoning lives here instead:

- **`0 3 * * *`** is 03:00 UTC = 08:00 Asia/Karachi — the morning digest for tomorrow's
  appointments. Hobby runs cron once a day and may fire anywhere inside the hour, which is
  why this is a digest rather than an exact 24-hour reminder.
- **`0 22 * * *`** is 03:00 Asia/Karachi, safely after the business day has ended.
- On **Pro**, tighten both to hourly (`0 * * * *`).

## Costs

| Service | Free tier covers | When you pay |
|---|---|---|
| Vercel Hobby | This app comfortably | Commercial use requires Pro ($20/mo) |
| Neon | 0.5 GB, scale-to-zero | Far beyond this app's needs |
| Resend | 3,000 emails/month | ~100 bookings/day |
| Domain | — | ~$12/year |

**Vercel Hobby forbids commercial use.** For a real paying client this needs Pro — which
also unlocks minute-level cron. Bill it to them.
