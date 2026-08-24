# Everyday use

## The live site — nothing to run

It is on the internet 24 hours a day. Your computer can be switched off.

| | |
|---|---|
| **Website** | https://booking-system-opal-theta.vercel.app |
| **Admin** | https://booking-system-opal-theta.vercel.app/login |

Bookmark both. That is all there is to it — no commands, no terminal.

Anyone can reach the website. Only someone with a login can reach the admin.

---

## Working on the code — start the dev server

Only needed when you want to **change** something. The live site keeps running either way.

Open a terminal and run:

```powershell
cd "C:\Users\TECH\Desktop\My Work\Booking System"
npm run dev
```

Then open **http://localhost:3000**

Press **Ctrl+C** in that terminal to stop it.

The quotes around the path matter — the folder name has spaces in it.

### Local vs live

They share the **same database**. A booking you make locally shows up on the live site and
vice versa. What differs is the code: local runs whatever is in your folder right now, live
runs whatever was last pushed to GitHub.

---

## Publishing a change

```powershell
git add -A
git commit -m "what you changed"
git push
```

Vercel notices the push and rebuilds automatically. About two minutes, then it is live.

Watch it at **vercel.com** → your project → **Deployments**.

---

## Useful commands

Run these from the project folder.

| Command | What it does |
|---|---|
| `npm run dev` | Start the local site |
| `npm run build` | Check it compiles before pushing |
| `npm test` | Run the test suite |
| `npm run show-state` | Who can log in, what is in the database |
| `npm run set-password <email>` | New password, generated and shown once |
| `npm run check-password-strength` | Warn if any account uses a development password |
| `npm run send-test-email <address>` | Create a real booking and send a real email |
| `npm run rebrand "New Name" newname` | Rename the business for a different client |

---

## If something looks wrong

**A change you made is not showing on the live site** — did you `git push`? Check
Deployments on Vercel for a red build.

**An image you replaced still shows the old one** — your browser cached it. Open a private
window (Ctrl+Shift+N) to confirm, then clear the cache.

**The local site will not start** — something is already using port 3000. Close other
terminals, or run `Get-Process node | Stop-Process -Force` and try again.

**Nobody receives confirmation emails** — expected. Resend is in test mode and only
delivers to the account owner's address. Verify a domain in Resend to reach real customers.

---

## Do not run these

`npm run db:seed` — wipes the database and recreates the demo data. It would delete real
bookings and reset every password.

`prisma db push` — silently drops the constraint that prevents double-booking. There is
deliberately no npm script for it.
