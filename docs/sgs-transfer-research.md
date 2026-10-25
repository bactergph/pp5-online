# SGS transfer research — 2026-10-25

## Evidence inspected

- Publisher manual: https://toschool.in/toschoolsource/download/ToSchoolSGS.pdf — especially pages 6–10.
- Publisher installation link: https://toschool.in/anr/ links to Chrome extension ID `ghbmmopedbmookmljfcfelohiiikcimo`.
- Public Chrome update package for that ID, manifest version **1.2.2**, inspected as text only. The extension was not installed or executed. No SGS account or student data was accessed.

Follow-up reverse engineering on the same date: the unmodified content script was subsequently executed in an isolated synthetic browser fixture, not in SGS. The extension itself was never installed. All page network requests were blocked, and only synthetic scores were used.

- User-provided store URL: https://chromewebstore.google.com/detail/toschool-to-sgs/ghbmmopedbmookmljfcfelohiiikcimo
- Public CRX size: **16,483 bytes**.
- CRX SHA-256: `18bb6dd45c350338386f4bb4bc398856e4bc1d01a8a3e192adbb1327153b9e80`.
- Inspected content-script SHA-256 (UTF-8 extracted text): `58518157dc07834beb6a1b68ff8db8697f8b579e55ae20dc4154b6d420b241c6`.
- Original package and extracted source remain in temporary, uncommitted `tmp/sgs-research/`; no third-party implementation or icons are included in the application source.

## Package architecture

The Manifest V3 package has one `content.js`, icons, a manifest, and Chrome package metadata. It declares `clipboardRead` and a content script for HTTP/HTTPS subdomains of `bopp-obec.info` and HTTPS `toschool.in`. It runs at document idle. No background worker, extension popup, external library, remote script loader, or explicit network client is present in the inspected implementation.

The paste handler targets text inputs with the `field_input`, `inputscore`, or `inputscore2` classes. It also includes a `p-wd` password input selector; because that input is excluded from its list of score inputs, pasting there is prevented without populating anything. This behavior was reproduced in the fixture and is an incidental defect, not required functionality for a Jarnsek implementation.

## Reconstructed control flow

1. Intercept a paste event originating from a supported input and prevent normal single-field paste.
2. Read clipboard plain text. Convert tabs and line feeds to comma separators, then split on commas. This flattens the source into one sequence; row and column boundaries are not retained.
3. Collect all supported score inputs in document order, and locate the currently focused input.
4. Walk forward from that location, skipping read-only or disabled inputs.
5. Assign each successive clipboard value. Dispatch `change` only for the first assigned cell, dispatch `input` for every assigned cell, focus the cell, then dispatch a synthetic Tab keydown.
6. Stop when the clipboard values or target inputs run out. There is no delay, queue waiting for server responses, rollback, or completion verification.

Synthetic keydown events are not physical keyboard presses and must not be assumed to have all native Tab behavior. The script explicitly moves focus; the fixture observed blur events as it moved to subsequent inputs. Whether the SGS page reacts to these events with network writes is a separate live-integration question.

## Browser experiments

The probe uses the actual extracted script, without modification, in a temporary headless Edge profile. Reproduce with `node tmp/sgs-research/probe.mjs` while the downloaded package remains available. Results are recorded in `tmp/sgs-research/probe-results.json`.

All **12 behavior assertions** passed; several deliberately confirm missing safeguards rather than desirable product behavior:

| Experiment | Observed result |
| --- | --- |
| One paste containing 2 students × 3 score columns | All 6 cells populated; 6 input events, 1 change event, 6 synthetic Tab events, 5 blur events |
| Start from a middle cell | Earlier cells remain unchanged; population continues from the focused cell |
| Disabled/read-only cells | Skipped without consuming a clipboard value |
| Zero versus blank | `0` remains zero; blank overwrites the existing value with an empty string |
| Trailing newline | Produces an extra empty value and clears the next editable cell |
| More values than inputs | Excess data is silently discarded |
| Comma-containing clipboard values | Commas are treated as separators; there is no quoted CSV parser |
| Invalid scores such as 999, -1, or text | Written without validation by this script; SGS may apply its own checks |
| Password field selector | Paste cancelled, no score cells populated |
| Student identifiers included in the pasted data | Written as cell values; no identity matching takes place |
| Mismatched source/target column counts | Values continue across target rows; no dimension check prevents misalignment |
| 40 synthetic students × 20 editable cells | 800 values populated in approximately **876 ms** on this fixture |

The timing excludes SGS handlers, SGS network latency, saving, and reading saved scores back. It is not a measured SGS import time. The isolated fixture made zero page network requests; this does not imply that the real SGS page would make zero requests in response to the dispatched events.

## Confirmed behavior

The manual describes selecting multiple score columns, showing all students on one SGS page, pasting into the first student's first score cell, and then using SGS's own Save button. Pasting alone does not persist scores according to the manual.

The inspected extension registers a paste listener on supported score inputs. It reads clipboard plain text, turns tab/newline-separated data into a sequence, collects score inputs in document order, and starts from the active cell. It synchronously fills successive editable inputs, skipping disabled and read-only cells. It dispatches input events, a change event for the first pasted cell, and synthetic Tab key events while moving focus. There is no explicit delay between cells.

The inspected script does not match student IDs; placement follows the visible cell order. It contains no explicit network request or automatic click on Save. SGS's own event handlers could still make requests; this cannot be determined by inspecting the extension alone.

## What this establishes

One paste can populate an entire visible score grid without keyboard/mouse automation delays. This supports the user's description. It does not establish that SGS accepts a single database write, that every SGS page behaves identically, or that a synthetic event guarantees persistence.

## Proposed Jarnsek implementation

1. Export selected score columns with the actual school student registration number, not the internal UUID used by the current Jarnsek score-transfer workbook.
2. In the extension, verify year, term, subject, classroom, student identities, editable columns, score limits, duplicate identifiers, and existing values before changing the grid.
3. Populate the visible grid in one user action. Match rows by student registration number rather than assuming identical row order. Keep blank and zero distinct; require an explicit policy for replacing existing scores.
4. Use the saving behavior verified for the specific SGS page. Retain a visible distinction between populated and saved.
5. After SGS reports completion, reload/read persisted values and compare them to the intended scores. Report confirmed, mismatched, and unverified cells separately; retries must not blindly overwrite other changes.

## Remaining live validation

Inspect an authorized SGS session's current score page and network behavior, first with a small teacher-approved sample. Determine which events update submitted state, how the native Save action works, what success/failure responses mean, and how the saved values can be read back. Do not claim a successful import merely because the input elements display numbers.

## Own implementation — 2026-10-25

An independent Jarnsek extension is implemented in `extensions/jarnsek-sgs/`, with installation and privacy instructions in its README. The score page now includes **ส่งคะแนนเข้า SGS**. Its typed exporter uses `students.student_code`, includes selectable score columns and source context, and rejects missing/duplicate registration codes. The existing internal Excel round-trip format remains unchanged.

`npm run build:sgs-extension` creates the downloadable `public/downloads/jarnsek-sgs-extension.zip` and an unpacked development copy under `tmp/jarnsek-sgs-extension`. The normal build regenerates the ZIP from the owned source. No code or icons from the inspected third-party extension are included.

`npm run test:sgs` checks the protocol and exporter, prior Excel behavior, actual extension panel and React export dialog, stale-data guards, identifier reordering, blanks/zero, JSON file selection, one-paste Excel dimensions, post-reload verification, mobile layouts, session receipt isolation/expiry, and downloadable archive/source consistency. A separate isolated unpacked-extension launch verified that its real service worker starts and Chrome session storage works.

The implementation deliberately labels a populated grid as unverified. It neither clicks the SGS Save button nor treats a local input value as proof of persistence. Its saved-score verification requires a new document after the teacher saves and reloads the SGS page, with matching URL and selected context controls. The live validation described above is still outstanding; all automated tests use synthetic data.
