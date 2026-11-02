# Jarnsek interface contract

The interface uses the existing blue/gold brand and six module identities. This
pass applies the motion, implementation handoff and design critique principles
from the reference video to the application itself; no Figma or Claude plugin is
required at runtime.

## Findings and implementation

| Finding | Change | Implementation |
| --- | --- | --- |
| Screens have different entry points and little guidance about the next action | A collapsed **วิธีใช้หน้านี้** disclosure with three steps for the current task; no extra navigation card | `WorkspacePageGuide`, `workspace-guidance.ts` |
| Modal alerts could appear behind an already open native editor, and did not contain keyboard focus | A native modal dialog in the browser's top layer; initial focus on the safe first action, Escape cancels, closing restores focus | `AppAlertModal` |
| Alert state relied heavily on bright colours and a large icon | A textual state label, readable title/message hierarchy, semantic colours, and 44px actions | `AppAlertModal` |
| Controls vary in size; small mobile form text can trigger browser zoom | Shared 44px form/action controls, 16px mobile form text; dense score/timetable cells retain their own geometry | `ui-system.css` |
| Focus rings and motion differ between modules and public/auth screens | Visible keyboard outlines, scroll offsets, short interaction transitions and reduced-motion support | `ui-system.css` |
| A clipped data table gives no indication that more columns exist | Overflow-only scroll hints, accessible region labels and keyboard panning; restore original attributes when the table fits and exclude document previews | `WorkspaceTableAccess`, `ui-system.css` |
| Module themes should not colour official reports or add help to print output | Screen-only rules; the guide uses the existing `no-print` contract; no new PDF styles or data writes | `ui-system.css`, root layout |

## Visual and interaction tokens

- Spacing: 4, 8, 12, 16 and 24px; surfaces use 12–20px radii.
- Text: dark blue body copy on white. Existing route tones remain blue (schedules),
  teal (scores/ปพ.5), violet (ปพ.6/reports), amber (homeroom administration), slate
  (settings/data) and navy (super admin).
- Success: `#146744` on `#eef9f2`; warning: `#805014` on `#fff8e8`;
  error: `#a72135` on `#fff2f4`. A label/message must accompany the colour.
- Motion: 140ms hover/focus changes, 200ms small disclosure changes. No continuous
  decorative animation or movement of table rows. Reduced motion disables
  nonessential animation across shell, landing and authentication screens.
- Focus: a 3px outline with 3px offset. Never remove it without an equivalent.
- Main actions retain the module colour. Destructive actions remain red and must
  not become the default focused action in a confirmation.

## Coverage and content rules

The shared shell applies the interaction contract to every workspace route.
Guidance covers schedules (online/device), scores, attendance, evaluation,
students/classes, homeroom administration, ปพ.5/ปพ.6, sign/reports, export including
SGS/SchoolMIS, settings and super admin. School-prefixed paths resolve to the same
instructions. Unknown/public paths do not receive an invented guide.

Instructions describe controls already present. They do not grant permissions,
save drafts, navigate users away from unsaved data or modify shared templates.
Device instructions explicitly state local storage and backup requirements;
substitute documents explicitly state their independence from normal schedules;
central-catalog administration and the SGS verification limits remain explicit.

Use a quiet collapsed disclosure for secondary explanation. Keep page-specific
actions beside their task. Do not add a second primary task-selection panel above
an editor or change a school's data to demonstrate a visual improvement.

## Verification and practical limits

- Route audit: enumerate every physical workspace page and every device view;
  verify guidance, prefix isolation and local-storage notes.
- Browser regression: real shell/navigation, public/auth, schedule wizard,
  period editor, six module identities, 320–1440px, keyboard focus, nested native
  modal alerts, touch sizing, reduced motion, and print-style comparisons.
- Functional regressions: save/edit/delete/PDF substitute flows and schedule
  editors use synthetic fixtures; they do not access production school data.
- This is a shared-system pass, not a claim that every record and role in every
  school's live account has been manually exercised or that the whole product is
  WCAG-certified.

Reference requirements:
[WCAG 2.2 target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
and [focus not obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html).
