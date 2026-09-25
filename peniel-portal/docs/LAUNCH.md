# Launch checklist: portal.penielindustry.org

Do these in order. Steps marked **(decision)** need Peniel's answer first:
they cost money or change something outside this repo.

Never paste keys or passwords into chats, tickets or commits. Type them
directly into the Supabase, Vercel or Resend dashboards.

## 1. Production Supabase project

The test project (`bjaxhmkyxmcrqiebtzzo`) keeps its sample data. Real
customers go in a **new, empty** project.

1. **(decision) Plan.** Create the project on the **Pro** plan (about
   US$25 per month). The free plan has no backups and pauses after a week
   without use. Pro includes daily backups kept for 7 days. Point-in-time
   recovery is an extra add-on and isn't needed at launch.
2. Region: choose the one nearest Addis Ababa that Supabase offers (for
   example `eu-central-1`, Frankfurt).
3. **SQL Editor.** Run each file in `supabase/migrations/` **in filename
   order** (01_schema first, `20260927000001_notifications.sql` last).
   **Do not run `supabase/seed.sql`** here: it is sample data.
4. **Companies and brands.** Add the real customers from **Ops → Customers**
   after the first admin exists (step 6).
5. **Authentication settings**:
   - *Sign In / Providers → Email*: turn **off** "Allow new users to sign up".
   - *URL Configuration*: Site URL `https://portal.penielindustry.org`;
     Redirect URLs `https://portal.penielindustry.org/auth/confirm`.
   - *Emails → Templates*: paste `supabase/templates/invite.html` and
     `supabase/templates/recovery.html`.
   - *Emails → SMTP Settings*: after step 3 below, turn on custom SMTP with
     host `smtp.resend.com`, port `465`, user `resend`, and a Resend API key
     as the password. Sender `portal@penielindustry.org`. Without this,
     Supabase sends only a few invite emails per hour.
6. **First admin.** Put the production keys in `.env.local` (or run it from a
   machine that has them), then:
   `npm run create-admin -- you@penielindustry.org "Your Name"`.
7. **Backups.** Dashboard → Database → Backups: confirm daily backups are
   listed the day after launch.

## 2. Vercel

1. **(decision) Plan.** Vercel's Hobby plan is for personal, non-commercial
   use only. A company portal needs **Pro** (about US$20 per member per
   month).
2. Import the GitHub repo. Set **Root Directory** to `peniel-portal`.
   Framework: Next.js. Nothing else to change.
3. **Environment variables** (Production). Enter each one in the Vercel
   dashboard, not in chat:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Production project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production anon / publishable key |
   | `SUPABASE_SERVICE_ROLE_KEY` | Production service_role key (secret) |
   | `NEXT_PUBLIC_SITE_URL` | `https://portal.penielindustry.org` |
   | `RESEND_API_KEY` | Resend API key (secret) |
   | `EMAIL_FROM` | `Peniel Portal <portal@penielindustry.org>` |

   Preview deployments should point at the **test** Supabase project, never
   production.
4. **Domain.** Project → Settings → Domains → add
   `portal.penielindustry.org`. Vercel then shows the DNS record to add
   (step 4 below).

## 3. Resend (email)

1. **(decision) Plan.** The free plan allows about 3,000 emails a month
   (100 a day) from one domain. That is enough for launch. Check the
   Settings page's email log after a month to see real volume.
2. Add the domain `penielindustry.org` and add the DNS records Resend shows
   (SPF, DKIM, and the bounce MX, usually on a `send.` subdomain). Wait for
   "Verified".
3. Create an API key with "Sending access" only. Put it in Vercel
   (`RESEND_API_KEY`) and in Supabase SMTP (step 1.5).

## 4. DNS for penielindustry.org

Add these at whoever hosts the domain's DNS:

| Type | Name | Value |
|---|---|---|
| CNAME | `portal` | The value Vercel shows (usually `cname.vercel-dns.com`) |
| TXT / MX | as shown by Resend | as shown by Resend |

The marketing site's records don't change.

## 5. Go-live checks

- [ ] `https://portal.penielindustry.org` shows the sign-in page with a valid
      certificate.
- [ ] `/login` works for the admin. Ops → Settings → Notification emails shows **On**.
- [ ] Invite a test customer user on a test company. The invite email
      arrives from `portal@penielindustry.org` and the link sets a password.
- [ ] As the test customer: place an order with a PO. Staff receive the "New
      order" email; the Settings email log shows **sent**.
- [ ] Confirm it as staff: the customer receives "Order confirmed".
- [ ] Open the order → **Preview as customer ↗**: no internal notes, lines or
      locations.
- [ ] Remove the test company's user (Ops → Users → deactivate).
- [ ] Next day: Supabase shows a completed backup.

## Rolling back

Vercel → Deployments → the previous deployment → **Promote to Production**.
Database changes are additive (migrations only add columns, views and
functions), so an older app version still runs against the newer database.
