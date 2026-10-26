# Shared interface appearance

The workspace uses a light blue and restrained gold identity, matching the
Jarnsek logo. `app/workspace-theme.css` supplies the shared navigation, surface,
form, button, table, evaluation and scheduling styles inside `.workspace-theme`.
The previous flattening overrides have been replaced rather than layered again.

- Deep blue page headers distinguish page context from white editing surfaces.
- Cards use a border plus two subtle shadow layers. Only clickable navigation
  cards lift on hover; this is disabled for reduced-motion users.
- Side navigation preserves its semantic section colours and highlights the
  current task. Membership badges, locked menu behaviour and sidebar ads retain
  their existing logic.
- Existing Kanit headings and Sarabun body text are reused. No new fonts, image
  assets, dependencies, animation loops or network calls are introduced.
- Shared forms, tables, focus rings and selected controls remain readable, with
  44px primary control heights on small screens. Dense score/evaluation cells
  retain their own layout and behaviour.
- Mobile page headers stack their actions rather than squeezing the title.

`app/public-brand.css` extends the identity to the public landing page, login,
school login and registration. Its selectors target only `.jsk` or `.auth-screen`.
Both theme files use `@media screen`: print/PDF documents keep their existing
paper styles, and embedded/chromeless report routes do not get workspace chrome.

Dashboard metric and shortcut components are in
`components/dashboard/DashboardCards.tsx`. They display the existing server data,
with no synthetic trends or fabricated counts. Dashboard shortcuts now lead to
implemented routes rather than ComingSoon pages; view-only roles retain view
shortcuts while admins/academic heads get schedule management.

Validation:

- `node scripts/test-dashboard-shortcuts.cjs`: seven roles, unique real routes,
  no placeholders, School/district separation and view/manage destinations.
- `node scripts/test-interface-design.mjs`: actual navigation/auth/landing/cards
  with synthetic data; five workspace widths, four public/login/signup widths,
  mobile drawer/dialog interaction, reduced motion and unchanged print styles.
- `node scripts/test-membership-ui.mjs`: package dialogs, locked Free navigation,
  member management, advertisements and responsive layout.
- `node scripts/test-free-schedule-ui.mjs`: the actual local wizard now runs in
  the shared production theme as well as exercising imports, the solver, backups,
  offline behaviour and teacher limits.

Browser fixtures and screenshots remain in `tmp/`; review images can be copied
to `output/` without becoming application assets. No school data is used by tests.
