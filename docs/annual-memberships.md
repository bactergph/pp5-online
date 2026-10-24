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
- Pro and School grants run for one calendar year from the selected start date.
  The final date remains valid through 23:59:59 in Asia/Bangkok. Renewal of an
  active subscription in the same package adds a year after its existing end;
  renewing an expired subscription starts a new year on the selected date.
- Pro has ten room identities for the entire workspace, shared across years
  and semesters. The identity is the existing level + room number; copying a
  historical snapshot of the same room does not consume another seat. A new
  year cannot create ten additional identities. Database advisory locks and
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
  optional start/end dates. It appears below desktop navigation or below mobile
  content, never over the timetable, and is omitted for paid members. Uploads
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
