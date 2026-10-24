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
- Super Admin uses **สมาชิกโรงเรียน → ตั้งแพ็กเกจ** to grant/change/renew a term.
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

Validation: `npm run test:membership`, `npm run test:schedules`,
`node scripts/test-schedule-preparation.cjs`, `node scripts/test-school-member.cjs`,
and `node scripts/test-device-schedule-services.cjs`.
