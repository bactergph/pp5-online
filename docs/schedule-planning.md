# Schedule planning and drafts — migration 063

## Scope and entry points

`/schedules/class/manage` (and school-prefixed equivalent) now has **เตรียมตาราง · 4 ขั้น** and **กำหนดกิจกรรมให้ชั้น/ห้อง**. Existing class/teacher/manual editing and clear scopes remain.

1. Reuse year/semester and bell times. Choose active weekdays within the existing Monday–Friday model. Times remain school-wide; day selection, workload overrides, room references and preferences are school/year/semester scoped.
2. Reuse existing class subjects/teachers. Correct the teacher/offering through the existing class-subject settings link; this screen edits weekly counts, block patterns and referenced venues. Annual-equivalent hours are divided by 40; the existing secondary subject writer stores credits × 80 annual-equivalent hours (credits × 2 weekly, credits × 40 semester hours). Missing hours are no longer silently given a one-period quota.
3. Multi-class, multi-cell activity assignment/removal with one preview, an additional explicit locked-slot confirmation, no teacher required, and no restoration of replaced subjects. Existing activity teachers are retained; conflicts are checked before preview and again on commit. Removal does not require unassigning the teacher.
4. Check → generate a server-owned draft → inspect classroom tables → confirm or discard. Both previous auto-action entry points now generate drafts. The legacy solver is retained for regression coverage, but is not called by the public auto actions.

## Database rollout (not applied to production)

Apply `supabase/migrations/063_schedule_planning_drafts.sql` **after 062 in staging/local first**. It is transactional and repeatable. It adds `schedule_plans` and `schedule_drafts`, with RLS and no anon/authenticated table/RPC access. App server actions enforce editable role, authenticated actor and school scope.

The migration wraps the existing schedule/time save functions to retain their established CAS, lock, school, teacher and semester validations. Before-functions are retained for compatibility; do not reapply older migrations after 063, because doing so would overwrite the wrappers. No existing timetable is rewritten during migration. Backup/snapshot before a production rollout; this task did not run a production migration.

Before 063, ordinary existing schedule reads/manual edits use a missing-table fallback; the new preparation/draft workflow explicitly reports that migration 063 is required.

A draft fingerprints live slots plus teacher/subject/activity/time/plan inputs. Confirmation locks the scheduling scope and metadata, compares the fingerprint, explicitly unlocks only approved impacted cells, then replaces the batch atomically. Same draft confirmation is idempotent. Stale/cancelled drafts cannot commit. Drafts expire after 24 hours; expired rows are not automatically purged and should be included in a future retention job if usage warrants it. No scheduled job was installed.

Venues are stable UUID references in the term plan. Existing free-text venue names remain visible but are **not automatically matched**; preflight warns until the operator selects a referenced venue. Selecting the same venue ID prevents booking it concurrently.

## Constraint behavior

Hard: class/teacher/venue collisions, teacher unavailability, configured days/periods, lunch, fixed activities, locks, quota and block patterns. Double/triple blocks use actual adjacency in the ordered bell times and cannot cross lunch or a time gap. Partial manual blocks are checked for feasible completion; completed blocks are also checked transactionally in SQL. Bell changes that split a completed block are rejected and rolled back.

Preferences: morning, spread across days, fewer teacher gaps and a desired maximum consecutive run. These rank search choices; they are not a promise of a globally optimal timetable. The bounded solver returns complete / invalid / exhausted-search conflict / time-or-node-limit separately and never commits a partial result. A draft is not regenerated automatically on confirm.

## Verification performed

- `npm run test:schedules`: existing regression suite passed.
- `npm run test:schedule-planning`: new block-solver, server preparation and PGlite transaction tests. Includes shared teacher/venue, lunch, outside-scope classes, locked activity replacement, two rooms × two cells, duplicate confirm, stale snapshot, actor/school isolation, cancellation and time-change rollback.
- Targeted ESLint: scheduling implementation files passed.
- Next production build: passed (repository already configures `ignoreBuildErrors: true`, so build is not evidence of a clean repository typecheck).
- Repository typecheck has pre-existing errors in unrelated reports/settings/test artifacts; final output recorded in `output/schedule-review/typecheck.txt`. New production scheduling paths were checked separately against that output.
- Browser tests used a temporary local route with the actual preparation UI and **mock server actions**, at 360/390/768/1024/1440 widths; bulk selection, explicit locked confirmation, draft discard, confirm failure/retry and page errors checked. This is not a live Supabase end-to-end test. Temporary review routes were removed from `app/` before build; archived under `output/review-fixtures` with `.fixture` extensions.
- Real jsPDF export with synthetic data rendered and inspected; selected weekdays, subjects, activity and venue text checked from the PDF. No real student data or signatures were used.

Screenshots and `checks.json` are under `output/schedule-review/`. Full keyboard/screen-reader audit and authenticated staging integration remain rollout checks. No push/deploy or production changes were performed.
