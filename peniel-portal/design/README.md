# Design reference

Screens exported from Claude Design (project "Peniel Industry Crown Cork UI",
handoff of 24 Sep 2026). They are HTML prototypes to read, not code to run:
they need Claude Design's runtime to render. Take layout, spacing, colours and
type from them; the portal's own components implement them.

| Folder | Contents |
|---|---|
| `staff/` | `Peniel Ops Staff Portal.dc.html` — every Peniel Ops screen (1a–1s), and `OpsNav.dc.html`, the sidebar |
| `customer/` | `Peniel Customer Portal.dc.html` — customer screens (1a–1s, incl. mobile), and `PortalNav.dc.html`, the top bar |
| `system/` | The Modernist design system: `styles.css` (tokens + components, ported into `app/globals.css`) and its guide |

## Decisions that override the design

Agreed with the product owner on 24 Sep 2026. The rules in `CLAUDE.md` win
wherever a screen disagrees with them.

- **Customer screens never show internal detail.** Some customer mockups show
  line names ("Now · Line 2", "Production slot … Line 1"), warehouse locations
  ("FG-2 · Bay 4") and per-batch crown height / removal torque. These are
  left out when those screens are built (CLAUDE.md rule 2).
- **Customer users see all of their company's brands.** The "Invite user"
  dialog's Customer admin / Orderer / Viewer roles and per-brand access are a
  later change, with their own isolation tests.
- **Order statuses follow the database** (`docs/PORTAL_SPEC.md` §3), including
  Confirmed and Rejected, styled with the design's badges. `quality_check` is
  shown as "QC inspection".
- **"Viewing as role"** in the Ops sidebar was a prototype device; the app
  shows the signed-in person's own role.
- **Login** has one form for everyone (the Customer / Peniel staff toggle is
  not needed) and signs in by email only.
