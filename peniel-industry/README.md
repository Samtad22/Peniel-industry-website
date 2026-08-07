# Peniel Industry PLC — Website

Production Next.js (App Router) + TypeScript + Tailwind CSS v4 codebase for Peniel Industry PLC,
a crown cork manufacturer based in Bole Lemi Industrial Park, Addis Ababa, Ethiopia.

## Getting started

```bash
npm install
npm run dev       # local development, http://localhost:3000
npm run build     # production build
npm start         # run the production build
npm run lint      # ESLint
```

## Project structure

```
app/                  Routes (App Router) — one folder per page, plus sitemap.ts, robots.ts,
                       and api/quote/route.ts (the quote form's backend endpoint)
components/
  layout/              Header, Footer
  home/                Homepage scroll-journey sections
  ui/                  Shared primitives (buttons, Reveal, Eyebrow, ScallopDivider, MapEmbed, etc.)
  forms/               QuoteForm
  LogoMark.tsx          Animated logo mark (gear rotates with scroll)
lib/
  constants.ts         Single source of truth for all verified company data/copy
  hooks.ts             Shared client hooks (media queries, scroll position)
fonts/                 Self-hosted font files (see "Fonts" below)
public/img/            Real photos and partner logos supplied by the client
```

## Content policy

Every fact on this site traces back to the client's original website or to material supplied
directly during this project. Nothing is invented. Two known gaps are intentionally marked
in-page rather than guessed at:

- **Certifications** (`/quality`) — no formal third-party certifications were supplied.
- **Resource library** (`/insights`) — no spec sheets/documents were supplied yet.

Both are labeled `[Verification required]` in the UI. Search `lib/constants.ts` and the two page
files for that string when real documentation becomes available.

## Fonts

Fonts are self-hosted via `next/font/local` rather than `next/font/google`, so the site has zero
runtime dependency on Google Fonts being reachable. The actual `.woff2` files live in `/fonts` and
were sourced from the corresponding `@fontsource/*` npm packages at build time (same font files
Google Fonts would have served). If you'd prefer to load from Google's CDN directly instead, swap
the `localFont(...)` calls in `app/layout.tsx` for `next/font/google` equivalents.

## Quote form

`/contact` submits to `app/api/quote/route.ts`, which validates the payload and sends an email via
[Resend](https://resend.com). Without `RESEND_API_KEY` set, it still validates and logs the
submission server-side instead of emailing — so the form works end-to-end in local dev without any
setup, and starts actually delivering email the moment you configure it.

To go live:
1. Create a Resend account and verify a sending domain
2. Copy `.env.example` to `.env.local` and fill in `RESEND_API_KEY` and `RESEND_SENDING_DOMAIN`
3. Optionally set `QUOTE_NOTIFY_EMAIL` if requests should go somewhere other than
   `info@penielindustry.org`
4. Add the same environment variables in your hosting provider's dashboard for production

Prefer a different provider (SendGrid, Postmark) or a CRM webhook instead? Swap the Resend call in
`app/api/quote/route.ts` — the validation and response shape around it can stay as-is.

## Map

`components/ui/MapEmbed.tsx` embeds Google Maps via the key-less `output=embed` share URL using the
verified coordinates (8.9714° N, 38.8568° E). This works without a Google Maps API key. For tighter
visual control (custom pin styling, etc.) swap in the Maps Embed API with a provisioned key.

## Images

All photos and partner logos in `public/img/` are real assets supplied by the client during this
project (not stock photography or placeholders):

- `hero-facility.jpg`, `factory-exterior.jpg` — the actual Bole Lemi facility
- `logo-icon.png` — extracted from the client's vector logo PDF
- `partners/*.png` — extracted individually from the client's partner-logos PDF, transparent
  backgrounds, color-quantized for file size

## Known placeholders

- Resend email delivery is not yet configured with real credentials (see "Quote form" above)
- Formal certifications and the downloadable resource library (see "Content policy")
- `SITE_URL` in `lib/constants.ts` is a placeholder domain — update once the real domain is live,
  since it feeds metadata, the sitemap, and JSON-LD schema
