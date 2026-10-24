# Substitute scheduling

The online and device editions use `SubstituteScheduleEntry`. The device edition persists in IndexedDB and makes no backend requests.

## Semester and availability

- Online initialization uses the active academic year's term calendar, with the existing Bangkok calendar fallback. Device initialization preserves the selected local semester.
- Online substitute availability uses recurring teacher blocks and the effective class timetable, including fixed activities and every member of an activity team.
- Substitute assignments are checked against the entries for the selected date in `availableSubstitutes`. Do not use `loadScheduleConstraints().blocks` in this editor: those blocks also contain substitute assignments from every date and would incorrectly exclude the current assignment itself.
- Importing an empty day must report that no lessons were found; the local edition must not replace saved entries with an empty result.

## Deleting saved entries

The screen provides deletion by period, absent teacher, or selected date, with confirmation. Unsaved edits must be saved or discarded first. Only substitute entries are deleted; the original class timetable is retained.

Apply `supabase/migrations/083_substitute_delete.sql` before deploying the online delete action. It adds a service-role-only RPC, checks school ownership and the expected day snapshot, and shares the school/year advisory lock used by substitute saves and imports. It does not change existing records during installation. The device service implements the same operation in its serialized local storage queue.

## Verification

- `npm run test:schedules`: timetable/availability regression checks, online service checks and actual PostgreSQL migration tests through PGlite; includes atomic deletion, wrong-school rejection, stale snapshots, role restrictions and preservation of unaffected rows.
- `node scripts/test-device-schedule-services.cjs`: local imports, assignments, repeat save, no-lesson rejection and deletion persistence.
- `node scripts/test-free-schedule-ui.mjs`: real shared UI, IndexedDB, import, substitute selection, repeat save, reload, cancel/delete by all three scopes, responsive print selection and PDF export. Uses synthetic data and no production writes.
