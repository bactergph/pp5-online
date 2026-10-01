/** Shared, scoped presentation for the two scheduling workspaces. */
export const SCHEDULE_PRESENTATION = `
  .schedule-workspace { --ink:#18344c; --accent:#245c76; --edge:#dce5ec; gap:20px; color:#233849; min-width:0; }
  .schedule-workspace .schedule-head {padding:22px 24px;background:#fff;border:1px solid var(--edge);border-left:4px solid var(--accent);border-radius:12px;}
  .schedule-workspace .schedule-head h1 {font-size:24px;font-weight:700;color:var(--ink);letter-spacing:-.3px;}
  .schedule-workspace .schedule-head p {font-size:13px;font-weight:400;line-height:1.8;margin-top:6px;color:#5c7081;}
  .schedule-workspace .schedule-tabs {gap:4px;padding:4px;border-radius:10px;background:#f0f4f7;}
  .schedule-workspace .schedule-tab {border:0;border-radius:7px;font-weight:600;color:#536779;min-height:38px;}
  .schedule-workspace .schedule-tab.is-active {background:var(--ink);color:white;}
  .schedule-workspace .schedule-filters {padding:20px;gap:18px;border-color:var(--edge);border-radius:12px;background:#fff;}
  .schedule-workspace .schedule-field {gap:8px;min-width:0;}
  .schedule-workspace .schedule-field label {font-size:12px;font-weight:600;color:#4b6172;}
  .schedule-workspace select,.schedule-workspace input:not([type=checkbox]) {font-family:inherit;box-sizing:border-box;}
  .schedule-workspace .schedule-field select,.schedule-workspace .schedule-field input {height:44px;min-width:0;border:1px solid #cbd8e2;border-radius:8px;font-size:14px;font-weight:500;padding:0 12px;color:var(--ink);background:#fbfcfd;}
  .schedule-workspace :is(button,select,input,a):focus-visible {outline:3px solid #86b9d2;outline-offset:3px;}
  .schedule-workspace :is(button,select,input):disabled {opacity:.55;cursor:not-allowed;}
  .schedule-workspace .schedule-toolbar,.schedule-workspace .sub-actions {padding:16px 20px;border:1px solid var(--edge);border-radius:12px;background:#fff;gap:10px;}
  .schedule-workspace .schedule-toolbar label {font-size:12px;display:flex;gap:7px;align-items:center;line-height:1.7;}
  .schedule-workspace .schedule-toolbar-btn,.schedule-workspace .sub-btn {min-height:42px;padding:9px 16px;border-radius:8px;border:1px solid #cbd8e2;background:#fff;color:var(--ink);font-size:13px;font-weight:600;line-height:1.4;transition:background .15s,border-color .15s;}
  .schedule-workspace :is(.schedule-toolbar-btn,.sub-btn):hover:not(:disabled) {background:#edf3f7;border-color:#92aaba;}
  .schedule-workspace :is(.schedule-toolbar-btn,.sub-btn).primary {background:var(--accent);border-color:var(--accent);color:#fff;}
  .schedule-workspace :is(.schedule-toolbar-btn,.sub-btn).primary:hover:not(:disabled) {background:#183f53;}
  .schedule-workspace .schedule-toolbar-btn.danger {color:#a33b3b;border-color:#ead3d3;background:#fff;}
  .schedule-workspace .schedule-info,.schedule-workspace .sub-day-label {padding:14px 18px;background:#edf4f8;border:1px solid #d4e3ed;border-radius:10px;color:#36586e;font-weight:400;font-size:13px;line-height:1.8;}
  .schedule-workspace .schedule-info a {color:#245c76;font-weight:600;text-decoration:underline;text-underline-offset:3px;}
  .schedule-workspace .schedule-grid-card,.schedule-workspace .sub-table-wrap {border:1px solid var(--edge);border-radius:12px;box-shadow:0 3px 12px #17364e06;max-width:100%;overflow:auto;}
  .schedule-workspace .schedule-grid-table th {background:#edf3f7;padding:15px 8px;font-size:13px;font-weight:600;color:#254359;}
  .schedule-workspace .schedule-grid-table th .period-time {font-size:11px;font-weight:400;color:#617789;margin-top:5px;}
  .schedule-workspace .schedule-grid-table th.col-day,.schedule-workspace .schedule-grid-table td.day-col {background:#e9f0f5;color:#294960;font-size:13px;font-weight:600;min-width:78px;}
  .schedule-workspace .schedule-grid-table td.cell {padding:12px 8px;min-width:138px;height:90px;}
  .schedule-workspace .schedule-grid-table th.col-break,.schedule-workspace .schedule-grid-table td.break-col {background:#f6f4ed;color:#756445;}
  .schedule-workspace .schedule-cell-top {gap:6px;align-items:center;}
  .schedule-workspace .schedule-cell-top select {min-width:0;}
  .schedule-workspace .schedule-cell-edit select {min-height:39px;font-size:12px;font-weight:500;border-color:#d7e2eb;border-radius:7px;}
  .schedule-workspace .schedule-lock-btn {width:30px;height:34px;border-radius:7px;}
  .schedule-workspace .schedule-teacher-line {font-size:11px;font-weight:400;color:#627889;margin-top:4px;line-height:1.6;}
  .schedule-workspace .schedule-cell-edit.is-conflict select {border-color:#d47676;background:#fff5f5;}
  .schedule-workspace .schedule-cell-edit.is-locked select {background:#edf1f4;}
  .schedule-workspace .sub-table {min-width:920px;font-size:13px;}
  .schedule-workspace .sub-table th {background:#edf3f7;font-size:12px;font-weight:600;color:#355369;padding:16px 14px;white-space:nowrap;}
  .schedule-workspace .sub-table td {padding:16px 14px;line-height:1.7;border-bottom:1px solid #e7edf2;vertical-align:middle;}
  .schedule-workspace .sub-table tbody tr:nth-child(even) {background:#fafcfd;}
  .schedule-workspace .sub-table tbody tr:hover {background:#f0f6fa;}
  .schedule-workspace .sub-table :is(select,input) {min-height:40px;font-size:12px;font-weight:400;border:1px solid #ccd9e3;background:#fff;border-radius:7px;padding:7px 9px;}
  .schedule-workspace .sub-table td:nth-child(6) {min-width:210px;}
  .schedule-workspace .sub-table td:last-child {min-width:160px;}
  .schedule-workspace .sub-footer {padding:18px 20px;border:1px solid #cbdbe6;border-radius:12px;box-shadow:0 6px 22px #18344c0c;gap:14px;}
  .schedule-workspace .sub-footer label {font-size:12px;color:#506878;}
  .schedule-workspace .sub-footer select {min-height:38px;margin-left:6px;border:1px solid #cbd8e2;border-radius:6px;background:#fff;padding:0 10px;}
  .schedule-workspace .quota-panel {border-color:var(--edge);border-radius:12px;overflow:auto;}
  .schedule-workspace .quota-panel-head {padding:16px 20px;background:#f4f7fa;}
  .schedule-workspace .quota-panel-head h3 {font-weight:600;}
  .schedule-workspace .quota-table {min-width:560px;font-size:12px;}
  .schedule-workspace .quota-table td {padding:10px 16px;}
  .schedule-workspace .quota-table th {font-size:11px;font-weight:600;}
  .schedule-workspace .schedule-empty {border:1px dashed #cbd8e2;border-radius:12px;background:#fafcfd;padding:40px 24px;font-weight:400;line-height:1.8;}
  @media(max-width:700px) {
    .schedule-workspace {gap:14px;}
    .schedule-workspace .schedule-head {padding:18px;}
    .schedule-workspace .schedule-head h1 {font-size:21px;}
    .schedule-workspace .schedule-filters {grid-template-columns:1fr!important;padding:16px;gap:14px;}
    .schedule-workspace .schedule-tabs {width:100%;}
    .schedule-workspace .schedule-tab {flex:1;justify-content:center;}
    .schedule-workspace .sub-footer {position:static;}
    .schedule-workspace .sub-footer>span {flex-basis:100%;}
    .schedule-workspace .sub-footer .sub-btn {flex:1;}
    .schedule-workspace .schedule-toolbar,.schedule-workspace .sub-actions {padding:14px;}
  }
  @media(prefers-reduced-motion:reduce) {.schedule-workspace * {transition:none!important;}}
`
