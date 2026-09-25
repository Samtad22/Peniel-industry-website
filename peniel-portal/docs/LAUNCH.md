# Launch checklist: portal.penielindustry.org

Do these in order. Steps marked **(decision)** need Peniel's answer first:
they cost money or change something outside this repo.

Never paste keys or passwords into chats, tickets or commits. Type them
directly into the Supabase, Vercel or Resend dashboards.

## 1. Production Supabase project

The test project (`bjaxhmkyxmcrqiebtzzo`) keeps its sample data. Real
customers go in a **new, empty** project.

1. **Plan: Free for now** (decided). What that means:
   - **No automatic backups.** Take a manual backup every week (step 7),
     and move to Pro (about US$25/month, daily backups) once real orders
     are flowing.
   - The project **pauses after 7 days with no activity**. Daily use keeps
     it awake. If it pauses, press **Restore** in the dashboard.
   - Limits: 500 MB database, 1 GB file storage, 2 free projects per
     account (the test project counts as one).
2. Region: **Central EU (Frankfurt)**, the nearest to Addis Ababa. Keep
   the Data API turned on.
3. **SQL Editor.** Run the one-file setup, `bash scripts/live-setup.sh >
   peniel-live-setup.sql`, once: it holds every migration in order plus the
   reference lists (defect types, hold reasons, production lines, raw
   materials). It refuses to run on a project that's already set up.
   **Do not run `supabase/seed.sql`** here: it is sample data.
4. **Companies and brands.** Add the real customers from **Ops → Customers**
   after the first admin exists (step 6). Each brand's crown image goes in
   with **Import crown images** (one PNG per brand, named after it, e.g.
   `st-george.png`) or from the brand's **Edit** dialog, which also takes the
   artwork on file (PDF, AI, EPS).
5. **Authentication settings**:
   - *Sign In / Providers → Email*: turn **off** "Allow new users to sign up".
   - *URL Configuration*: Site URL `https://portal.penielindustry.org`;
     Redirect URLs `https://portal.penielindustry.org/auth/confirm`.
   - *Emails → Templates*: paste `supabase/templates/invite.html` and
     `supabase/templates/recovery.html` (subjects in step 4b).
   - *Emails → SMTP Settings*: after step 3 below, turn on custom SMTP with
     host `smtp.resend.com`, port `465`, user `resend`, and a Resend API key
     as the password. Sender `portal@penielindustry.org`. Without this,
     Supabase sends only a few invite emails per hour.
6. **First admin** (after step 5, so the invite link points at the portal):
   Authentication → Users → **Add user → Send invitation**, then run this in
   the SQL Editor with the real name and email:
   ```sql
   insert into public.profiles (user_id, full_name, email, role)
   select id, 'Full Name', email, 'admin' from auth.users
   where lower(email) = lower('you@penielindustry.org')
   on conflict (user_id) do update set role = 'admin', active = true, company_id = null;
   ```
   (Or, from a computer with the repo and the live keys in `.env.local`:
   `npm run create-admin -- you@penielindustry.org "Your Name"`.)
8. **Point Vercel at it.** In Vercel → Settings → Environment Variables,
   production gets the live project and previews keep the test project:
   - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (these
     currently cover Preview and Production): edit each one and untick
     **Production**, then **Add** the same name again for **Production** only
     with the live value (Project URL; Publishable key).
   - `SUPABASE_SERVICE_ROLE_KEY` (Production): edit and paste the live
     **Secret** key.
   - Redeploy production.
7. **Backups (manual on the free plan).** Once a week, from a computer with
   the Supabase CLI: `supabase db dump --db-url "<connection string>" -f
   peniel-YYYY-MM-DD.sql` (connection string: Dashboard → Connect). Keep
   the files somewhere safe and off that computer. This covers the
   database, not uploaded files; download the Storage buckets too, or move
   to Pro.

## 2. Vercel

1. **Plan: Hobby (free) for now** (decided). Vercel's terms limit Hobby to
   non-commercial use, so plan to move to Pro (about US$20 per member per
   month) before the portal is relied on for business.
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
4. **Region: done.** Functions run in **Frankfurt (`fra1`)**, next to the
   live Supabase project (Settings → Functions → Region). Keep them in the
   same region as the database; each page makes several database calls.
5. **Domain.** Project → Settings → Domains → add
   `portal.penielindustry.org`. Vercel then shows the DNS record to add
   (step 4 below).

## 3. Resend (email)

1. **Plan: Free** (decided): about 3,000 emails a month, 100 a day, one
   domain. Check the Settings page's email log after a month to see real
   volume.
2. **Done:** `penielindustry.org` is already **Verified** in Resend, so its
   email DNS records exist. Any `@penielindustry.org` sender works. Skip the
   email rows in the DNS table below.
3. Create a new API key named "Peniel Portal" with **Sending access** only,
   limited to `penielindustry.org`. Put it in Vercel (`RESEND_API_KEY`,
   marked Sensitive, Production) and in Supabase SMTP (step 1.5). A
   separate key means it can be revoked without affecting the website.

## 4. DNS for penielindustry.org

Do this after the domain is added in Vercel (step 2.4). Only the `portal`
CNAME is still needed: the email records are already in place (Resend shows
the domain as Verified). Copy each value exactly.

| For | Type | Name / Host | Value | Notes |
|---|---|---|---|---|
| Portal | CNAME | `portal` | what Vercel shows, e.g. `cname.vercel-dns.com` | Only this subdomain. The website's records don't change. |
| Email (bounces) | MX | `send` | what Resend shows, e.g. `feedback-smtp.eu-west-1.amazonses.com` | Priority `10`. |
| Email (SPF) | TXT | `send` | what Resend shows, e.g. `v=spf1 include:amazonses.com ~all` | On `send`, so it doesn't touch the domain's own SPF. |
| Email (DKIM) | TXT | `resend._domainkey` | the long key Resend shows | Copy the whole value. |
| Email (DMARC) | TXT | `_dmarc` | `v=DMARC1; p=none;` | Only if the domain has no `_dmarc` record yet. |

- **Where:** penielindustry.org's DNS is at **Porkbun** (nameservers
  `*.ns.porkbun.com`). Porkbun → Domain Management → penielindustry.org →
  **DNS** → add each record. Leave the existing records (the website's
  ALIAS/A and `www`) as they are.
- The Vercel project `peniel-portal` (team Peniel) already exists, builds
  from `main` with Root Directory `peniel-portal`, and has
  `portal.penielindustry.org` added. It goes live once the CNAME below exists.
- **Name / Host:** most DNS hosts add `.penielindustry.org` for you, so type
  only `portal`, `send`, and so on. If the host shows the full name, enter
  `portal.penielindustry.org` instead.
- **Cloudflare:** set the `portal` record to **DNS only** (grey cloud), not
  proxied.
- **Existing email:** don't change or remove any existing MX or TXT records
  on the bare domain (`@`). The records above are all on subdomains.
- Changes usually take effect within minutes, and can take up to 48 hours.
  Vercel shows "Valid Configuration" and Resend shows "Verified" when
  they're working.

## 4b. Keeping portal emails out of spam

DNS is already right for `penielindustry.org`: Resend's DKIM key
(`resend._domainkey`), SPF on `send.penielindustry.org`, and a DMARC record
(`p=quarantine`). With DMARC on quarantine, any email that fails these checks
goes to spam, so check one email first (step 1).

1. **Check an email passes.** In Gmail open a portal email → ⋮ → *Show
   original*. SPF, DKIM and DMARC must all say **PASS**. If DMARC fails, the
   email wasn't sent through Resend with the verified domain.
2. **Supabase invite and reset emails** (both projects): Authentication →
   Emails → Templates. *Invite user*: subject `Your Peniel Portal account`,
   body = `supabase/templates/invite.html`. *Reset password*: subject `Reset
   your Peniel Portal password`, body = `supabase/templates/recovery.html`.
   Their links point at portal.penielindustry.org (not supabase.co), which
   spam filters prefer. SMTP Settings: sender name `Peniel Portal`, sender
   email `portal@penielindustry.org`.
3. **Resend**: Domains → penielindustry.org → turn **off** Click tracking and
   Open tracking. Tracking rewrites links, which spam filters penalise.
4. **A real mailbox for the sender.** Create `portal@penielindustry.org` in
   Google Workspace (a user, group or alias) so replies don't bounce.
5. **Google Workspace (Peniel's own staff)**: Admin console → Apps → Google
   Workspace → Gmail → Spam, phishing and malware → *Email allowlist* or an
   *Approved senders* rule for `portal@penielindustry.org`.
6. **First weeks**: ask each new user to mark the first email *Not spam* and
   add `portal@penielindustry.org` to their contacts. A new sender builds
   reputation over a few weeks of normal, low-volume sending.

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
- [ ] Deactivate the test customer user (Ops → Customers → the company → user list).
- [ ] Next day: Supabase shows a completed backup.

## Rolling back

Vercel → Deployments → the previous deployment → **Promote to Production**.
Database changes are additive (migrations only add columns, views and
functions), so an older app version still runs against the newer database.
