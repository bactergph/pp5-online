# Annual memberships

Run `supabase/migrations/082_annual_memberships.sql` after the earlier migrations,
before deploying this release. It adds subscription dates/history, protected
membership RPCs, atomic quota enforcement and the `membership-ads` public image
bucket. It does not remove existing users, classrooms, schedules or documents.

- Public registration creates one active Free account and an isolated workspace
  in one database transaction. If that transaction fails, registration removes
  the newly created Auth user. A client cannot choose its own package.
- Free uses the local timetable (25 teachers), own profile and authentication.
  Locked menus open the Facebook upgrade dialog. Online data operations are
  denied even when called directly, including after expiration.
  Each successful Free login opens the package comparison once. Continuing Free
  consumes the welcome URL flag, so refreshing or navigating does not reopen it.
  Mobile also has a **แพ็กเกจ** button in the top bar. Pricing opens full-screen
  with a Free / Pro / Pro Plus selector, Pro shown first for Free members, and a
  persistent price/signup action. The School tab uses the same live quote as
  desktop. Continuing Free or closing the dialog never changes membership.
  The local timetable keeps a backup reminder at the upper right while scrolling,
  with a direct JSON download for all years/terms. Download feedback indicates
  the download was started; the user should check the file in Downloads. Backup
  also remains available after a local database write fails.
- Pro and School grants run for one calendar year from the selected start date.
  The final date remains valid through 23:59:59 in Asia/Bangkok. Renewal of an
  active subscription in the same package adds a year after its existing end;
  renewing an expired subscription starts a new year on the selected date.
- Pro has 20 room identities and Pro Plus has 50 for the entire workspace, shared across years
  and semesters. The identity is the existing level + room number; copying a
  historical snapshot of the same room does not consume another seat. A new
  year cannot create another quota of room identities. Database advisory locks and
  triggers enforce the cap for direct writes, imports and bulk creation too.
- Personal workspaces have one real login account. Inactive personnel records
  with generated `pending-` emails may be used for teaching assignments, but
  activating them cannot bypass the one-account limit. School members retain
  their existing staff-role permissions and multi-account workflow.
- Expiration changes effective access to Free without deleting stored data.
  Legacy school accounts with no dates keep existing access until Super Admin
  explicitly sets an annual term; this release does not silently expire schools.
- Super Admin uses **จัดการสมาชิก → แพ็กเกจ** to grant/change/renew a term.
  Every change uses an optimistic version check and writes an audit history in
  the same database transaction. Normal school settings cannot change packages.
- **โฆษณาตารางฟรี** manages image upload, title, target link, enabled state and
  optional start/end dates. A configured, enabled, in-date ad appears directly
  below member information in the left sidebar, including the mobile menu.
  It has no dismiss button and is omitted when unconfigured or for paid members. Uploads
  are district-only and accept PNG/JPEG/WebP with server-side size/signature checks.

`getSession()` intentionally denies Free access for online data operations.
`getSession(true)` is identity-only and must be restricted to the authenticated
shell, own profile, password/logout flows and local scheduling. Likewise,
`verifySession(true)` is reserved for the shell/local timetable. Membership is
read from the database on every request and is never granted from JWT claims.

Free registration also collects school name, an optional logo, director and
academic head, and academic year. Those details stay in IndexedDB, keyed to the
new account ID, and initialize an empty local scheduler after login. Existing
local timetables are never replaced by registration defaults. No logo or school
settings are uploaded by Free registration. **ตั้งค่าเบื้องต้น**, to the right of
**จัดตาราง**, edits the current local school's metadata; opening another academic
year archives the previous timetable. The logo and signatories are included in
the local backup and PDF export. Failed local writes remain visibly unsaved.

Validation: `npm run test:membership`, `npm run test:schedules`,
`node scripts/test-schedule-preparation.cjs`, `node scripts/test-school-member.cjs`,
and `node scripts/test-device-schedule-services.cjs`.

## Member directory

`/district/admins` lists membership owner/admin accounts, not staff personnel.
Public registration is automatically active Free; it does not await manual
approval. Account enable/disable and paid package validity are separate states.
Paid subscriptions still require an explicit Super Admin change.

The directory shows the profile's actual `users.created_at` in Asia/Bangkok,
newest first, with search, account/package/expiry filters, 25-row pagination,
desktop rows and mobile cards. Missing dates remain explicitly unspecified.
Expired Pro/School rows retain their purchased package label and explain that
their effective access is Free. Upcoming expirations use a 30-day window.

The initial list reads paginated profiles and batches linked schools; it does
not query Auth, students or personnel per member. Auth metadata (last login,
school account quota) loads only when opening details. Failures remain visible
with retry instead of silently reporting an empty directory.

Package changes/renewals retain the existing version check and audit history.
Editing a profile without changing its school must retain the exact school ID,
including legacy catalog-linked accounts. Account activation and deletion must
surface database/Auth failures; never remove a profile after Auth deletion fails.
No additional database migration is required for this directory redesign.

Common account actions are available directly in each directory row: **แก้ไข**
and **ลบ**. Selecting rows exposes **ลบที่เลือก**, with one confirmation showing
the exact selected accounts. Package, Free teacher allowance and details remain
available alongside those actions.

Super Admin can add a Free account with name, email and password without catalog
search. An optional typed school name creates its own workspace; catalog selection
remains optional. Auth creation runs before workspace creation so duplicate
emails do not leave new schools behind. Failed profile creation compensates the
new Auth account and newly created manual workspace. Editing profile fields keeps
the school unchanged by default and does not repeat school initialization.

## Free teacher allowance per member school

Apply `084_free_teacher_allowance.sql` before deploying this addition. Every
school starts at 25 teachers. Super Admin can open **จัดการสมาชิก → ครูฟรี … คน ·
ปรับ**, or **รายละเอียด → ปรับจำนวนครูตัวฟรี**, enter a whole number of at least
25, and save. The default can be restored by selecting 25. The allowance belongs
to that school/member code, including accounts sharing the same workspace.
Changing it never changes the package, subscription dates, Pro room limit or
other schools' allowances. A protected, district-only RPC serializes changes
with package updates, checks the membership version and records history atomically.

Members refresh the website online to receive the new allowance; after that,
their local database and computation continue on the device, including offline.
The sidebar and local desk display the effective allowance. All local teacher
imports, preflight, draft confirmation and backup restoration use the same
server-supplied limit. Backups cannot grant themselves a larger allowance.
Reducing the allowance preserves existing data and permits deleting teachers;
generation/confirmation is blocked while the teacher count exceeds the new limit.

`scripts/test-free-teacher-allowance.cjs` covers 25/50 limits, atomic imports,
backup validation, worker generation above 25, reduction during a draft,
protected SQL writes, same-school scope, independent schools and Free access.

## Package comparison and pricing (085)

Run `085_membership_packages_pricing.sql` after 084 before deploying the new member UI. It expands Pro to 20 distinct room identities, adds Pro Plus with 50, and adds protected billing fields plus a service-role-only `set_annual_membership_v2` RPC. Existing subscriptions and classroom data are preserved; no existing member is billed, expired, upgraded or downgraded by the migration. The old RPC is retained for compatibility during deployment.

- Pro: 499 THB/year, one real login, 20 rooms and 1 selected homeroom. Pro Plus: 799 THB/year, one real login, 50 rooms and 3 selected homerooms. Both allow unlimited inactive teaching personnel for scheduling. Personal academic data is limited to subjects the owner teaches and homerooms selected under migration 087. The database still prevents a second real login for a personal workspace.
- School: max(990 THB, agreed student count × 10 THB) per calendar-year term. Super Admin supplies a positive integer student count and confirms activation manually. This is the current-year count for billing, not a count of archived student rows or a new automatic deletion/student cap. School personnel accounts no longer inherit the obsolete default Auth metadata quota of 15.
- The accepted annual price and student count are stored on the school and in the same atomic membership history record. They do not initiate a payment, charge a card, or automatically reprice an active subscription. Existing members have no inferred retroactive bill. Renewal can use an updated agreed student count.
- The comparison dialog has personal and School tabs, current-package badges, annual prices, a live School calculator, full feature descriptions and a mobile layout. The member badge opens it for paid members too. Free can dismiss it without being trapped by a redirect.
- SGS is presented as an experimental helper using the separately installed Chrome extension. Live SGS persistence validation is still outstanding and is disclosed in the dialog.
- Signup/public descriptions and Super Admin filters/forms include Pro Plus and the same prices. Free teacher allowances continue to use each member's configured value.

Run `086_school_minimum_990.sql` after 085 for the revised 990 THB minimum. It updates future School grants/renewals only, preserving already-agreed prices and history.

Validation: `npm run test:membership`; the new package tests execute the actual 085 SQL in PGlite, including direct/bulk room writes, expiry/CAS/renewal/history, protected quote writes and legacy preservation. UI tests use synthetic accounts only.

## Personal teaching and homeroom scope (087)

Run `087_personal_teaching_homeroom_scope.sql` after 086. It adds a protected selection table and a service-role-only RPC for the membership owner. Pro allows 1 selected homeroom and Pro Plus allows 3 per academic year. These rooms are selected from the existing 20/50 room quota; selecting homerooms does not create additional classroom capacity. School keeps its existing role and teacher assignments.

Owners select rooms in **ห้องประจำชั้นของฉัน** on the classroom settings or classroom administration page. Selection is atomic, validates the school/year/owner, and shares the membership advisory lock. An existing unambiguous owner assignment is initialized only when it fits the plan. Otherwise the owner chooses explicitly. Membership downgrades and room changes preserve past records; an over-limit selection must be reduced before further homeroom editing.

- Scores, score configurations, subject attendance and subject reports use only the owner's teaching assignments, including when the owner has the admin role needed for importing/configuring a personal workspace.
- Homeroom administration, health, shared student evaluations and class/PP6 reports use selected homerooms. PP6 still requires complete underlying results; this change does not synthesize scores for other teachers.
- Database write triggers cover subject and homeroom data, validate both old and new rows on updates, and reject mixed-scope bulk writes atomically. Parent FK cleanup remains available. No historical academic data is deleted by this migration.
- Trusted archive loaders live in a server-only module, separate from authenticated public Server Actions, so clients cannot supply an artificial district/admin role.
- Free remains local scheduling with its existing teacher allowance. This migration adds no student cap, billing change, automatic repricing or retention deletion.

Tests: `test-personal-homeroom.cjs` executes actual SQL in PGlite; `test-personal-data-scope.cjs` tests server helpers/actions; `test-personal-report-scope.cjs` tests report filtering and unchanged School access; `test-personal-homeroom-ui.mjs` renders the real selection component with synthetic data at four responsive widths. `test-score-entry-period.cjs` covers personal-owner subject access and School admin compatibility.
