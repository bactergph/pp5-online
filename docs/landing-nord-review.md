# Landing redesign — 10 October 2026

## Design and scope
Reworked the marketing homepage around a large product hero, a short capability strip, three visual work categories, alternating score/attendance/report stories, compact supporting tools, a school-type comparison, onboarding, FAQ, and a dark final CTA. Preserved the existing logo, Sarabun, login/register paths, PDF example and synthetic screenshot assets. All CSS is scoped to `.jsk`. No backend, authentication, schema, or permissions changes. This iteration has not been pushed or deployed.

Reference: https://nordvpn.com/ . Web retrieval exposed its content structure (hero, product-led feature sections and repeated CTA). Headless Chrome on desktop and mobile encountered the access challenge; actual reference layout could not be visually verified. No NordVPN assets or marketing claims were reused. Visual choices follow the owner's explicit brief, rather than claiming a pixel-level reference inspection.

## Important files
- `components/auth/PublicWelcome.tsx`: new page composition, image previews and actions; retains native modal focus handling, keyboard role tabs and native FAQ disclosure.
- `components/auth/landing-showcase.css`: scoped tokens, rose CTA, editorial layouts, portrait document and responsive rules.
- `components/auth/landing-content.ts`: updated five-link navigation; preserves verified content.
- `app/page.tsx`: existing accurate metadata retained, no edit necessary.

## Verified content
- `lib/school-education-type.ts`: primary configuration supports A.2–M.3, secondary M.1–M.6. Secondary hides classroom administration and combined-class PP5.
- Scores page: Excel import/export with its supported template; no external automatic integration claim.
- SchoolMIS export page: class/school CSV grade export, not an automatic connection.
- PP6 example: existing actual generator output with fictional people/school and blank signature fields. Daily attendance imagery is explicitly labelled daily/primary, not subject attendance.
- Public registration requires approval. Existing teachers are directed to their existing accounts/school login.

## Checks actually run
- Targeted ESLint: passed for PublicWelcome, landing-content and app/page.
- Production build: passed, 108 static routes generated. Existing project setting skips type validation in build.
- Separate `tsc --noEmit`: failed with 64 diagnostics in existing report/district/fixture code; none in the changed landing files. This is not a clean repository-wide typecheck.
- Chrome production preview `http://localhost:3014`: widths 360, 390, 768, 1024, 1440 passed horizontal-overflow, one-H1, visible-image loading, anchor target, keyboard role-tab, keyboard FAQ, menu Escape, image zoom/Escape/focus-return checks.
- GET /login, /register, /sample-pp6.pdf: HTTP 200. No registration submitted and no live records modified.
- No page JavaScript errors in these checks. Not a full screen-reader or WCAG audit.
- CSS zoom 200% at a 1440px viewport: no horizontal page overflow. This is a reflow simulation, not certification of OS/browser zoom behavior.
- Contrast against white: ink 16.32:1, secondary text 6.58:1, blue 5.84:1, white CTA text on rose 4.57:1.
- Local unthrottled production timing, first load: TTFB 138ms, DOMContentLoaded 188ms, LCP 388ms, resource transfer 585,999 bytes. Two warm loads: LCP 40/48ms. These are local measurements, not production speed or a before/after performance comparison. No baseline performance measurement was recorded.

## Review artifacts
All in `output/landing-nord/`:
- before-1440.png / before-390.png
- after-{width}.png: full-page results at all five widths
- hero-{width}.png, scores-{width}.png, reports-{width}.png, school-types-{width}.png, questions-{width}.png
- footer-1440.png and zoom-200.png
- checks.json, performance.json, typecheck.txt, build.txt
Reference screenshots contain an access challenge and are not evidence of reference design review.

## Information still needed from owner
Confirmed service pricing/terms, public operator identity and support contact for prospective schools, and published privacy/terms pages. No invented prices, free trial, contact details, endorsement, testimonials, legal assurances or dead policy links were added. An actual PP5 sample could later supplement the correctly labelled PP6 example; the current page does not mislabel PP6 as PP5.
