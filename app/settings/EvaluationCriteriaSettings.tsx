'use client'

import { useEffect, useState } from 'react'
import {
  createEvaluationSetting,
  fetchEvaluationSettings,
  resetEvaluationSettings,
  saveCharacterTopicWithBehaviors,
  saveReadingStandardWithIndicators,
  saveEvaluationSetting,
} from './actions'
import LoadingButton from '@/components/LoadingButton'
import { useAppAlert } from '@/lib/use-app-alert'
import {
  type CharacterGridRow,
  type EvaluationKind,
  type EvaluationSetting,
  type ReadingIndicatorGridRow,
  EDUCATION_BAND_OPTIONS,
  type EducationBand,
  characterBehaviorsForTopic,
  compareEvaluationItemNumbers,
  isCharacterBehaviorItem,
  isReadingIndicatorItem,
  isReadingStandardItem,
  readingIndicatorsForStandard,
} from '@/lib/evaluation-settings'

type CriteriaTab = Extract<EvaluationKind, 'character' | 'reading' | 'competency'>

const CRITERIA_TABS: Array<{ id: CriteriaTab; label: string; desc: string }> = [
  { id: 'character', label: 'คุณลักษณะอันพึงประสงค์', desc: 'คุณลักษณะ 8 ข้อ' },
  { id: 'reading', label: 'อ่าน คิด วิเคราะห์', desc: 'อ่าน คิดวิเคราะห์ และเขียน' },
  { id: 'competency', label: 'สมรรถนะสำคัญ', desc: 'สมรรถนะสำคัญของผู้เรียน 5 ด้าน' },
]

const blankCharacterBehaviorRow = (): CharacterGridRow => ({ itemNo: '', detail: '' })
const CHARACTER_BEHAVIOR_COLS = [
  { key: 'itemNo' as const, label: 'ข้อที่', w: 90 },
  { key: 'detail' as const, label: 'รายละเอียด', w: 420 },
]

const blankReadingIndicatorRow = (): ReadingIndicatorGridRow => ({
  itemNo: '',
  detail: '',
  rubric0: '',
  rubric1: '',
  rubric2: '',
  rubric3: '',
})

const READING_INDICATOR_COLS = [
  { key: 'itemNo' as const, label: 'ข้อที่', w: 70 },
  { key: 'detail' as const, label: 'ตัวชี้วัด', w: 240 },
  { key: 'rubric3' as const, label: '3 ดีเยี่ยม', w: 130 },
  { key: 'rubric2' as const, label: '2 ดี', w: 130 },
  { key: 'rubric1' as const, label: '1 ผ่าน', w: 130 },
  { key: 'rubric0' as const, label: '0 ปรับปรุง', w: 130 },
]

const READING_GROUP_LABELS: Record<string, string> = {
  '1': 'อ่าน',
  '2': 'วิเคราะห์',
  '3': 'เขียน',
}

export default function EvaluationCriteriaSettings() {
  const [activeTab, setActiveTab] = useState<CriteriaTab>('character')
  const [characterBand, setCharacterBand] = useState<EducationBand>('1')
  const [readingBand, setReadingBand] = useState<EducationBand>('1')
  const { notify, clearAlert, AlertModal } = useAppAlert()
  const [evaluationSettings, setEvaluationSettings] = useState<Record<CriteriaTab, EvaluationSetting[]>>({
    character: [],
    reading: [],
    competency: [],
  })
  const [loadingSettings, setLoadingSettings] = useState(false)
  const [editingSetting, setEditingSetting] = useState<EvaluationSetting | null>(null)
  const [settingFormMode, setSettingFormMode] = useState<'add' | 'edit'>('edit')
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [behaviorGrid, setBehaviorGrid] = useState<CharacterGridRow[]>(() => Array.from({ length: 4 }, blankCharacterBehaviorRow))
  const [indicatorGrid, setIndicatorGrid] = useState<ReadingIndicatorGridRow[]>(() => Array.from({ length: 2 }, blankReadingIndicatorRow))

  const evaluationKind = activeTab
  const currentSettings = evaluationSettings[evaluationKind]
  const displayedSettings = evaluationKind === 'character'
    ? currentSettings
      .filter(setting => !isCharacterBehaviorItem(setting.short_label))
      .slice()
      .sort((a, b) => compareEvaluationItemNumbers(a.short_label, b.short_label))
    : evaluationKind === 'reading'
      ? currentSettings
        .filter(setting => isReadingStandardItem(setting.short_label))
        .slice()
        .sort((a, b) => compareEvaluationItemNumbers(a.short_label, b.short_label))
      : currentSettings
  const characterBehaviorCount = (topicNumber: string) => currentSettings.filter(
    setting => isCharacterBehaviorItem(setting.short_label) && setting.short_label.startsWith(`${topicNumber}.`),
  ).length
  const readingIndicatorCount = (standardNumber: string) => currentSettings.filter(
    setting => isReadingIndicatorItem(setting.short_label) && setting.short_label.startsWith(`${standardNumber}.`),
  ).length

  const activeCriteriaBand = evaluationKind === 'character'
    ? characterBand
    : evaluationKind === 'reading'
      ? readingBand
      : undefined

  useEffect(() => {
    void loadEvaluationSettings(evaluationKind, activeCriteriaBand)
  }, [evaluationKind, characterBand, readingBand])

  useEffect(() => {
    setEditingSetting(null)
  }, [characterBand, readingBand])

  useEffect(() => {
    if (!editingSetting || evaluationKind !== 'character' || isCharacterBehaviorItem(editingSetting.short_label)) return
    const rows = characterBehaviorsForTopic(currentSettings, editingSetting.short_label)
    setBehaviorGrid(
      rows.length > 0
        ? [...rows, blankCharacterBehaviorRow(), blankCharacterBehaviorRow()]
        : Array.from({ length: 4 }, blankCharacterBehaviorRow),
    )
  }, [editingSetting, evaluationKind, currentSettings])

  useEffect(() => {
    if (!editingSetting || evaluationKind !== 'reading' || isReadingIndicatorItem(editingSetting.short_label)) return
    const rows = readingIndicatorsForStandard(currentSettings, editingSetting.short_label)
    setIndicatorGrid(
      rows.length > 0
        ? [...rows, blankReadingIndicatorRow(), blankReadingIndicatorRow()]
        : Array.from({ length: 2 }, blankReadingIndicatorRow),
    )
  }, [editingSetting, evaluationKind, currentSettings])

  async function loadEvaluationSettings(kind: CriteriaTab, band?: EducationBand) {
    setLoadingSettings(true)
    const result = await fetchEvaluationSettings(kind, band)
    setEvaluationSettings(prev => ({ ...prev, [kind]: result.settings }))
    setLoadingSettings(false)
    if (result.error) notify('error', result.error)
  }

  function openAddEvaluationSetting() {
    const nextOrder = currentSettings.length ? Math.max(...currentSettings.map(setting => setting.sort_order)) + 1 : 1
    const nextCharacterTopic = evaluationKind === 'character'
      ? String(
        Math.max(
          0,
          ...currentSettings
            .filter(setting => !isCharacterBehaviorItem(setting.short_label))
            .map(setting => parseInt(setting.short_label, 10) || 0),
        ) + 1,
      )
      : evaluationKind === 'reading'
        ? String(
          Math.max(
            0,
            ...currentSettings
              .filter(setting => isReadingStandardItem(setting.short_label))
              .map(setting => parseInt(setting.short_label, 10) || 0),
          ) + 1,
        )
        : `${nextOrder}`
    setSettingFormMode('add')
    setEditingSetting({
      kind: evaluationKind,
      field_key: '',
      label: '',
      short_label: evaluationKind === 'character' || evaluationKind === 'reading' ? nextCharacterTopic : '',
      description: null,
      group_label: evaluationKind === 'reading'
        ? (READING_GROUP_LABELS[nextCharacterTopic] || '')
        : (CRITERIA_TABS.find(tab => tab.id === evaluationKind)?.label || ''),
      sort_order: nextOrder,
      is_active: true,
      score_type: 'score_0_3',
      max_score: 3,
      is_required: false,
      hours_per_year: 0,
    })
  }

  function openEditEvaluationSetting(setting: EvaluationSetting) {
    if (evaluationKind === 'character' && isCharacterBehaviorItem(setting.short_label)) {
      const parentNo = setting.short_label.split('.')[0]
      const parent = currentSettings.find(item => item.short_label === parentNo)
      if (parent) {
        setSettingFormMode('edit')
        setEditingSetting(parent)
        return
      }
    }
    if (evaluationKind === 'reading' && isReadingIndicatorItem(setting.short_label)) {
      const parentNo = setting.short_label.split('.')[0]
      const parent = currentSettings.find(item => item.short_label === parentNo)
      if (parent) {
        setSettingFormMode('edit')
        setEditingSetting(parent)
        return
      }
    }
    setSettingFormMode('edit')
    setEditingSetting(setting)
  }

  function setBehaviorCell(rowIndex: number, key: keyof CharacterGridRow, value: string) {
    setBehaviorGrid(rows => {
      const next = [...rows]
      next[rowIndex] = { ...next[rowIndex], [key]: value }
      return next
    })
  }

  function onBehaviorCellPaste(rowIndex: number, colIndex: number, event: React.ClipboardEvent) {
    const text = event.clipboardData.getData('text')
    if (!text.includes('\t') && !text.includes('\n')) return
    event.preventDefault()
    const lines = text.replace(/\r/g, '').split('\n')
    while (lines.length && lines[lines.length - 1] === '') lines.pop()
    setBehaviorGrid(rows => {
      const next = [...rows]
      lines.forEach((line, rowOffset) => {
        const cells = line.split('\t')
        const targetRow = rowIndex + rowOffset
        while (next.length <= targetRow) next.push(blankCharacterBehaviorRow())
        cells.forEach((value, colOffset) => {
          const targetCol = colIndex + colOffset
          if (targetCol >= CHARACTER_BEHAVIOR_COLS.length) return
          const key = CHARACTER_BEHAVIOR_COLS[targetCol].key
          next[targetRow] = { ...next[targetRow], [key]: value.trim() }
        })
      })
      return next
    })
  }

  function setIndicatorCell(rowIndex: number, key: keyof ReadingIndicatorGridRow, value: string) {
    setIndicatorGrid(rows => {
      const next = [...rows]
      next[rowIndex] = { ...next[rowIndex], [key]: value }
      return next
    })
  }

  async function handleSettingSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!editingSetting) return
    setSettingsSaving(true)
    clearAlert()
    const fd = new FormData(e.currentTarget)

    if (evaluationKind === 'character') {
      const topicNo = String(fd.get('short_label') || '').trim()
      const topicLabel = String(fd.get('label') || '').trim()
      const behaviorRows = behaviorGrid
        .map(row => ({ itemNo: row.itemNo.trim(), detail: row.detail.trim() }))
        .filter(row => row.itemNo || row.detail)
      const maxScore = Math.max(0, Number(fd.get('max_score') || editingSetting.max_score || 3))
      const { error } = await saveCharacterTopicWithBehaviors(
        editingSetting.id || null,
        {
          short_label: topicNo,
          label: topicLabel,
          max_score: maxScore,
          is_active: fd.get('is_active') === 'on',
        },
        behaviorRows,
        characterBand,
      )
      setSettingsSaving(false)
      if (error) { notify('error', error); return }
      notify('success', editingSetting.id ? 'บันทึกหัวข้อและพฤติกรรมบ่งชี้เรียบร้อย' : 'เพิ่มหัวข้อและพฤติกรรมบ่งชี้เรียบร้อย')
      setEditingSetting(null)
      await loadEvaluationSettings(evaluationKind, characterBand)
      return
    }

    if (evaluationKind === 'reading') {
      const standardNo = String(fd.get('short_label') || '').trim()
      const standardLabel = String(fd.get('label') || '').trim()
      const groupLabel = String(fd.get('group_label') || '').trim() || READING_GROUP_LABELS[standardNo] || null
      const indicatorRows = indicatorGrid
        .map(row => ({
          itemNo: row.itemNo.trim(),
          detail: row.detail.trim(),
          rubric0: row.rubric0.trim(),
          rubric1: row.rubric1.trim(),
          rubric2: row.rubric2.trim(),
          rubric3: row.rubric3.trim(),
        }))
        .filter(row => row.itemNo || row.detail || row.rubric0 || row.rubric1 || row.rubric2 || row.rubric3)
      const { error } = await saveReadingStandardWithIndicators(
        editingSetting.id || null,
        {
          short_label: standardNo,
          label: standardLabel,
          group_label: groupLabel,
          is_active: fd.get('is_active') === 'on',
        },
        indicatorRows,
        readingBand,
      )
      setSettingsSaving(false)
      if (error) { notify('error', error); return }
      notify('success', editingSetting.id ? 'บันทึกมาตรฐานและตัวชี้วัดเรียบร้อย' : 'เพิ่มมาตรฐานและตัวชี้วัดเรียบร้อย')
      setEditingSetting(null)
      await loadEvaluationSettings(evaluationKind, readingBand)
      return
    }

    const payload = {
      label: String(fd.get('label') || ''),
      short_label: String(fd.get('short_label') || ''),
      description: String(fd.get('description') || ''),
      group_label: String(fd.get('group_label') || ''),
      sort_order: Number(fd.get('sort_order') || editingSetting.sort_order),
      is_active: fd.get('is_active') === 'on',
    }
    const { error } = editingSetting.id
      ? await saveEvaluationSetting(editingSetting.id, payload)
      : await createEvaluationSetting(evaluationKind, payload)
    setSettingsSaving(false)
    if (error) { notify('error', error); return }
    notify('success', editingSetting.id ? 'บันทึกการตั้งค่าเรียบร้อย' : 'เพิ่มข้อประเมินเรียบร้อย')
    setEditingSetting(null)
    await loadEvaluationSettings(evaluationKind, activeCriteriaBand)
  }

  async function toggleSetting(setting: EvaluationSetting) {
    if (!setting.id) return
    const { error } = await saveEvaluationSetting(setting.id, { ...setting, is_active: !setting.is_active })
    if (error) { notify('error', error); return }
    await loadEvaluationSettings(evaluationKind, activeCriteriaBand)
  }

  async function moveSetting(setting: EvaluationSetting, direction: -1 | 1) {
    if (!setting.id) return
    const index = currentSettings.findIndex(item => item.id === setting.id)
    const swapWith = currentSettings[index + direction]
    if (!swapWith?.id) return
    setSettingsSaving(true)
    clearAlert()
    const [first, second] = await Promise.all([
      saveEvaluationSetting(setting.id, { ...setting, sort_order: swapWith.sort_order }),
      saveEvaluationSetting(swapWith.id, { ...swapWith, sort_order: setting.sort_order }),
    ])
    setSettingsSaving(false)
    const error = first.error || second.error
    if (error) { notify('error', error); return }
    await loadEvaluationSettings(evaluationKind, activeCriteriaBand)
  }

  async function handleResetSettings() {
    const band = evaluationKind === 'character' ? characterBand : evaluationKind === 'reading' ? readingBand : undefined
    const bandLabel = EDUCATION_BAND_OPTIONS.find(option => option.value === band)?.label || ''
    const confirmText = band
      ? `คืนค่าการตั้งค่า${CRITERIA_TABS.find(tab => tab.id === evaluationKind)?.label || ''} ${bandLabel} กลับเป็นค่าเริ่มต้น?`
      : 'คืนค่าการตั้งค่าประเมินแท็บนี้กลับเป็นค่าเริ่มต้น?'
    if (!confirm(confirmText)) return
    setSettingsSaving(true)
    clearAlert()
    const { error } = await resetEvaluationSettings(evaluationKind, band)
    setSettingsSaving(false)
    if (error) { notify('error', error); return }
    notify('success', 'คืนค่าเริ่มต้นเรียบร้อย')
    setEditingSetting(null)
    await loadEvaluationSettings(evaluationKind, band)
  }

  return (
    <div className="page-stack">
      <AlertModal />

      <div className="school-settings-tab-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div className="school-settings-tabs" role="tablist" aria-label="ตั้งค่าคุณลักษณะ อ่านคิด สมรรถนะ">
          {CRITERIA_TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => {
                setActiveTab(tab.id)
                setEditingSetting(null)
              }}
              className={`school-settings-tab ${activeTab === tab.id ? 'is-active' : ''}`}
            >
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
          {(activeTab === 'character' || activeTab === 'reading') && (
            <div style={{ minWidth: 260 }}>
              <label className="form-label" style={{ marginBottom: 6 }}>ช่วงชั้น</label>
              <select
                className="form-input"
                value={activeTab === 'character' ? characterBand : readingBand}
                onChange={event => {
                  const nextBand = event.target.value as EducationBand
                  if (activeTab === 'character') setCharacterBand(nextBand)
                  else setReadingBand(nextBand)
                }}
                disabled={settingsSaving || loadingSettings}
              >
                {EDUCATION_BAND_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {editingSetting && (
        <div className="modal-backdrop" onClick={() => !settingsSaving && setEditingSetting(null)}>
          <div className="modal-card" style={{ maxWidth: evaluationKind === 'reading' ? 980 : 720, maxHeight: 'calc(100vh - 32px)', overflowY: 'auto' }} onClick={event => event.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 18 }}>
              <div>
                <div className="section-title" style={{ marginBottom: 4 }}>{settingFormMode === 'add' ? 'เพิ่มข้อประเมิน' : 'แก้ไขรายการประเมิน'}</div>
                <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 13 }}>
                  {CRITERIA_TABS.find(tab => tab.id === evaluationKind)?.label || 'รายการประเมิน'}
                </p>
              </div>
              <button type="button" onClick={() => setEditingSetting(null)} disabled={settingsSaving} className="btn btn-ghost" style={{ padding: '7px 10px' }}>
                ปิด
              </button>
            </div>
            <form onSubmit={handleSettingSave}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
                {evaluationKind === 'character' ? (
                  <>
                    <div style={{ maxWidth: 140 }}>
                      <label className="form-label">ข้อที่ *</label>
                      <input name="short_label" defaultValue={editingSetting.short_label} className="form-input" placeholder="1" required />
                    </div>
                    <div style={{ maxWidth: 120 }}>
                      <label className="form-label">คะแนน *</label>
                      <input name="max_score" type="number" defaultValue={editingSetting.max_score ?? 3} className="form-input" min={0} step={1} required />
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <label className="form-label">หัวข้อ *</label>
                      <input name="label" defaultValue={editingSetting.label} className="form-input" placeholder="เช่น รักชาติ ศาสน์ กษัตริย์" required />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label className="form-label">พฤติกรรมบ่งชี้</label>
                      <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
                          <thead>
                            <tr style={{ background: 'var(--bg-2)' }}>
                              {CHARACTER_BEHAVIOR_COLS.map(column => (
                                <th key={column.key} style={{ width: column.w, padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: 'var(--text-2)', borderLeft: column.key === 'detail' ? '1px solid var(--border)' : undefined }}>
                                  {column.label}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {behaviorGrid.map((row, rowIndex) => (
                              <tr key={`behavior-grid-${rowIndex}`}>
                                {CHARACTER_BEHAVIOR_COLS.map((column, colIndex) => (
                                  <td key={column.key} style={{ borderTop: '1px solid var(--border)', borderLeft: column.key === 'detail' ? '1px solid var(--border)' : undefined, padding: 0 }}>
                                    <input
                                      value={row[column.key]}
                                      onChange={event => setBehaviorCell(rowIndex, column.key, event.target.value)}
                                      onPaste={event => onBehaviorCellPaste(rowIndex, colIndex, event)}
                                      className="form-input"
                                      style={{ width: '100%', border: 'none', outline: 'none', padding: '6px 8px', fontSize: 13, background: 'transparent', fontFamily: 'inherit', borderRadius: 0 }}
                                      placeholder={column.key === 'itemNo' ? '1' : 'เช่น เป็นพลเมืองดีของชาติ'}
                                    />
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                        <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 12 }}>
                          ข้อที่ <b>1, 2, 3, 4</b> ภายใต้หัวข้อนี้จะบันทึกเป็น <b>1.1, 1.2, 1.3, 1.4</b> ใน ปพ.5
                        </p>
                        <button type="button" onClick={() => setBehaviorGrid(rows => [...rows, blankCharacterBehaviorRow()])} className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }}>
                          + เพิ่มแถว
                        </button>
                      </div>
                    </div>
                  </>
                ) : evaluationKind === 'reading' ? (
                  <>
                    <div style={{ maxWidth: 140 }}>
                      <label className="form-label">มาตรฐานที่ *</label>
                      <input name="short_label" defaultValue={editingSetting.short_label} className="form-input" placeholder="1" required />
                    </div>
                    <div>
                      <label className="form-label">ด้าน</label>
                      <input name="group_label" defaultValue={editingSetting.group_label || READING_GROUP_LABELS[editingSetting.short_label] || ''} className="form-input" placeholder="เช่น อ่าน" />
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <label className="form-label">ชื่อมาตรฐาน *</label>
                      <input name="label" defaultValue={editingSetting.label} className="form-input" placeholder="เช่น การอ่าน" required />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label className="form-label">ตัวชี้วัดและระดับคุณภาพ</label>
                      <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
                          <thead>
                            <tr style={{ background: 'var(--bg-2)' }}>
                              {READING_INDICATOR_COLS.map(column => (
                                <th key={column.key} style={{ width: column.w, padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: 'var(--text-2)', borderLeft: column.key !== 'itemNo' ? '1px solid var(--border)' : undefined }}>
                                  {column.label}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {indicatorGrid.map((row, rowIndex) => (
                              <tr key={`indicator-grid-${rowIndex}`}>
                                {READING_INDICATOR_COLS.map(column => (
                                  <td key={column.key} style={{ borderTop: '1px solid var(--border)', borderLeft: column.key !== 'itemNo' ? '1px solid var(--border)' : undefined, padding: 0, verticalAlign: 'top' }}>
                                    <textarea
                                      value={row[column.key]}
                                      onChange={event => setIndicatorCell(rowIndex, column.key, event.target.value)}
                                      className="form-input"
                                      rows={column.key === 'detail' ? 3 : 2}
                                      style={{ width: '100%', border: 'none', outline: 'none', padding: '6px 8px', fontSize: 12, background: 'transparent', fontFamily: 'inherit', borderRadius: 0, resize: 'vertical', minHeight: column.key === 'detail' ? 68 : 52 }}
                                      placeholder={column.key === 'itemNo' ? '1' : column.key === 'detail' ? 'ข้อความตัวชี้วัด' : 'คำอธิบายระดับคุณภาพ'}
                                    />
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                        <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 12 }}>
                          ข้อที่ <b>1, 2</b> ภายใต้มาตรฐานนี้จะบันทึกเป็น <b>1.1, 1.2</b> — กรอกเกณฑ์คะแนน 0–3 ในแต่ละแถว
                        </p>
                        <button type="button" onClick={() => setIndicatorGrid(rows => [...rows, blankReadingIndicatorRow()])} className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }}>
                          + เพิ่มแถว
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ gridColumn: 'span 2' }}>
                      <label className="form-label">ชื่อรายการ *</label>
                      <input name="label" defaultValue={editingSetting.label} className="form-input" required />
                    </div>
                    <div>
                      <label className="form-label">ชื่อย่อ *</label>
                      <input name="short_label" defaultValue={editingSetting.short_label} className="form-input" required />
                    </div>
                    <div>
                      <label className="form-label">ด้าน/กลุ่ม</label>
                      <input name="group_label" defaultValue={editingSetting.group_label || ''} className="form-input" />
                    </div>
                    <div>
                      <label className="form-label">ลำดับ</label>
                      <input name="sort_order" type="number" defaultValue={editingSetting.sort_order} className="form-input" min={1} />
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <label className="form-label">คำอธิบาย</label>
                      <input name="description" defaultValue={editingSetting.description || ''} className="form-input" />
                    </div>
                  </>
                )}
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, color: 'var(--text-2)' }}>
                  <input name="is_active" type="checkbox" defaultChecked={editingSetting.is_active} />
                  เปิดใช้งานในหน้าบันทึกผล
                </label>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                <button type="button" onClick={() => setEditingSetting(null)} disabled={settingsSaving} className="btn btn-secondary">ยกเลิก</button>
                <LoadingButton type="submit" loading={settingsSaving}>บันทึก</LoadingButton>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="data-card" style={{ padding: 20, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div style={{ minWidth: 0 }}>
            <div className="section-title" style={{ marginBottom: 6 }}>
              ตั้งค่า{CRITERIA_TABS.find(tab => tab.id === evaluationKind)?.label}
            </div>
            <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 13 }}>
              {evaluationKind === 'character'
                ? `แสดงเฉพาะหัวข้อหลักของ${EDUCATION_BAND_OPTIONS.find(option => option.value === characterBand)?.label || 'ช่วงชั้น'} — กดแก้ไขเพื่อจัดการพฤติกรรมบ่งชี้ในตารางย่อย`
                : evaluationKind === 'reading'
                  ? `แสดงเฉพาะมาตรฐานหลักของ${EDUCATION_BAND_OPTIONS.find(option => option.value === readingBand)?.label || 'ช่วงชั้น'} — กดแก้ไขเพื่อจัดการตัวชี้วัดและเกณฑ์ระดับ 0–3`
                  : 'แก้ไขชื่อที่แสดง ลำดับ เปิด/ปิดรายการ และเพิ่มข้อประเมินของโรงเรียนได้'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button type="button" onClick={openAddEvaluationSetting} disabled={settingsSaving} className="btn btn-primary">+ เพิ่มข้อ</button>
            <button type="button" onClick={handleResetSettings} disabled={settingsSaving} className="btn btn-secondary">คืนค่าเริ่มต้น</button>
          </div>
        </div>
        {loadingSettings ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)' }}>กำลังโหลดการตั้งค่า...</div>
        ) : (
          <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
            <table className="thai-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  {evaluationKind === 'character' ? (
                    <>
                      <th style={{ width: 90 }}>ข้อที่</th>
                      <th style={{ width: 240 }}>หัวข้อ</th>
                      <th style={{ width: 80, textAlign: 'center' }}>คะแนน</th>
                      <th>พฤติกรรมบ่งชี้</th>
                    </>
                  ) : evaluationKind === 'reading' ? (
                    <>
                      <th style={{ width: 90 }}>มาตรฐาน</th>
                      <th style={{ width: 240 }}>ชื่อมาตรฐาน</th>
                      <th style={{ width: 80, textAlign: 'center' }}>คะแนน</th>
                      <th>ตัวชี้วัด</th>
                    </>
                  ) : (
                    <>
                      <th style={{ width: 54 }}>ลำดับ</th>
                      <th>รายการประเมิน</th>
                    </>
                  )}
                  <th style={{ width: 90 }}>สถานะ</th>
                  <th style={{ width: 180 }}>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {displayedSettings.map((setting, index) => (
                  <tr key={setting.id || setting.field_key}>
                    {evaluationKind === 'character' ? (
                      <>
                        <td style={{ textAlign: 'center', fontWeight: 800 }}>{setting.short_label}</td>
                        <td style={{ fontWeight: 800 }}>{setting.label}</td>
                        <td style={{ textAlign: 'center' }}>{setting.max_score ?? 3}</td>
                        <td style={{ color: 'var(--text-3)' }}>
                          {characterBehaviorCount(setting.short_label) > 0
                            ? `${characterBehaviorCount(setting.short_label)} รายการ`
                            : '—'}
                        </td>
                      </>
                    ) : evaluationKind === 'reading' ? (
                      <>
                        <td style={{ textAlign: 'center', fontWeight: 800 }}>{setting.short_label}</td>
                        <td style={{ fontWeight: 800 }}>{setting.label}</td>
                        <td style={{ textAlign: 'center' }}>{setting.max_score ?? 0}</td>
                        <td style={{ color: 'var(--text-3)' }}>
                          {readingIndicatorCount(setting.short_label) > 0
                            ? `${readingIndicatorCount(setting.short_label)} รายการ`
                            : '—'}
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={{ textAlign: 'center', color: 'var(--text-3)' }}>{setting.sort_order}</td>
                        <td>
                          <div style={{ fontWeight: 800, color: 'var(--text)' }}>{setting.label}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                            {setting.short_label}{setting.description ? ` · ${setting.description}` : ''}
                          </div>
                        </td>
                      </>
                    )}
                    <td>
                      <span className={`badge ${setting.is_active ? 'badge-success' : 'badge-gray'}`}>
                        {setting.is_active ? 'เปิดใช้' : 'ปิด'}
                      </span>
                    </td>
                    <td>
                      {evaluationKind !== 'character' && evaluationKind !== 'reading' && (
                        <>
                          <button type="button" onClick={() => moveSetting(setting, -1)} disabled={index === 0 || settingsSaving} style={{ color: 'var(--text-3)', fontSize: 13, marginRight: 8, background: 'none', border: 'none', cursor: 'pointer' }}>ขึ้น</button>
                          <button type="button" onClick={() => moveSetting(setting, 1)} disabled={index === displayedSettings.length - 1 || settingsSaving} style={{ color: 'var(--text-3)', fontSize: 13, marginRight: 8, background: 'none', border: 'none', cursor: 'pointer' }}>ลง</button>
                        </>
                      )}
                      <button type="button" onClick={() => openEditEvaluationSetting(setting)} style={{ color: 'var(--primary)', fontSize: 13, marginRight: 8, background: 'none', border: 'none', cursor: 'pointer' }}>แก้ไข</button>
                      <button type="button" onClick={() => toggleSetting(setting)} disabled={settingsSaving} style={{ color: setting.is_active ? '#DC2626' : '#059669', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer' }}>
                        {setting.is_active ? 'ปิด' : 'เปิด'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
