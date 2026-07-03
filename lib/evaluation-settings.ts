import {
  CHARACTER_BAND_TOPICS,
  type EducationBand,
} from './character-band-defaults'
import { READING_BAND_STANDARDS, readingRubricForIndicator } from './reading-band-defaults'

export type EvaluationKind = 'activities' | 'character' | 'reading' | 'competency'

export type { EducationBand } from './character-band-defaults'
export { EDUCATION_BAND_OPTIONS, educationBandFromClassroomLevel } from './character-band-defaults'

export const NON_CHARACTER_EDUCATION_BAND = '0'

const BANDED_EVALUATION_KINDS = new Set<EvaluationKind>(['character', 'reading'])

export function isBandedEvaluationKind(kind: EvaluationKind) {
  return BANDED_EVALUATION_KINDS.has(kind)
}

export function evaluationBandForKind(kind: EvaluationKind, educationBand?: EducationBand) {
  return isBandedEvaluationKind(kind) ? (educationBand || '1') : NON_CHARACTER_EDUCATION_BAND
}

export type EvaluationScoreType = 'score_0_3' | 'pass_fail'

export type RubricLevelKey = '0' | '1' | '2' | '3'

export type RubricLevels = Partial<Record<RubricLevelKey, string>>

export type EvaluationSetting = {
  id?: string
  kind: EvaluationKind
  field_key: string
  label: string
  short_label: string
  description: string | null
  group_label: string | null
  sort_order: number
  is_active: boolean
  score_type: EvaluationScoreType
  max_score: number
  is_required: boolean
  hours_per_year: number
  rubric_levels?: RubricLevels | null
  education_band?: string
}

export const READING_SCORE_FIELD_KEYS = [
  'reading_1_1',
  'reading_1_2',
  'thinking_2_1',
  'thinking_2_2',
  'writing_3_1',
] as const

export const READING_INDICATOR_FIELD_KEYS: Record<string, string> = {
  '1.1': 'reading_1_1',
  '1.2': 'reading_1_2',
  '2.1': 'thinking_2_1',
  '2.2': 'thinking_2_2',
  '3.1': 'writing_3_1',
}

export function readingDefaultSettingsForBand(band: EducationBand): Omit<EvaluationSetting, 'id'>[] {
  return READING_BAND_STANDARDS[band].flatMap(standard => {
    const standardRow: Omit<EvaluationSetting, 'id'> = {
      kind: 'reading',
      education_band: band,
      field_key: standard.fieldKey,
      label: standard.label,
      short_label: standard.shortLabel,
      description: null,
      group_label: standard.groupLabel,
      sort_order: sortOrderFromEvaluationItemNumber(standard.shortLabel),
      is_active: true,
      score_type: 'score_0_3',
      max_score: standard.indicators.length * 3,
      is_required: true,
      hours_per_year: 0,
      rubric_levels: null,
    }
    const indicatorRows = standard.indicators.map(indicator => ({
      kind: 'reading' as const,
      education_band: band,
      field_key: indicator.fieldKey,
      label: indicator.label,
      short_label: indicator.shortLabel,
      description: indicator.label,
      group_label: indicator.groupLabel,
      sort_order: sortOrderFromEvaluationItemNumber(indicator.shortLabel),
      is_active: true,
      score_type: 'score_0_3' as const,
      max_score: 3,
      is_required: true,
      hours_per_year: 0,
      rubric_levels: indicator.rubricLevels,
    }))
    return [standardRow, ...indicatorRows]
  })
}

export const EVALUATION_KIND_LABELS: Record<EvaluationKind, string> = {
  activities: 'กิจกรรมพัฒนาผู้เรียน',
  character: 'คุณลักษณะอันพึงประสงค์',
  reading: 'อ่าน คิด วิเคราะห์',
  competency: 'สมรรถนะสำคัญ',
}

export function characterDefaultSettingsForBand(band: EducationBand): Omit<EvaluationSetting, 'id'>[] {
  const topics = CHARACTER_BAND_TOPICS[band]
  return topics.flatMap((topic, topicIndex) => {
    const topicNo = topicIndex + 1
    const topicRow: Omit<EvaluationSetting, 'id'> = {
      kind: 'character',
      education_band: band,
      field_key: `trait${topicNo}_score`,
      label: topic.label,
      short_label: String(topicNo),
      description: null,
      group_label: 'คุณลักษณะ',
      sort_order: topicNo * 1000,
      is_active: true,
      score_type: 'score_0_3',
      max_score: 3,
      is_required: true,
      hours_per_year: 0,
      rubric_levels: null,
    }
    const behaviorRows = topic.behaviors.map((behavior, behaviorIndex) => {
      const subNo = behaviorIndex + 1
      const shortLabel = `${topicNo}.${subNo}`
      return {
        kind: 'character' as const,
        education_band: band,
        field_key: `trait${topicNo}_${subNo}_indicator`,
        label: behavior,
        short_label: shortLabel,
        description: behavior,
        group_label: null,
        sort_order: topicNo * 1000 + subNo,
        is_active: true,
        score_type: 'score_0_3' as const,
        max_score: 3,
        is_required: false,
        hours_per_year: 0,
        rubric_levels: null,
      }
    })
    return [topicRow, ...behaviorRows]
  })
}

export const EVALUATION_DEFAULT_SETTINGS: Record<EvaluationKind, Omit<EvaluationSetting, 'id'>[]> = {
  activities: [
    {
      kind: 'activities',
      field_key: 'guidance_result',
      label: 'กิจกรรมแนะแนว',
      short_label: 'แนะแนว',
      description: 'บันทึกผลผ่านหรือไม่ผ่านกิจกรรมแนะแนว',
      group_label: 'กิจกรรมพัฒนาผู้เรียน',
      sort_order: 1,
      is_active: true,
      score_type: 'pass_fail',
      max_score: 1,
      is_required: true,
      hours_per_year: 40,
    },
    {
      kind: 'activities',
      field_key: 'scout_result',
      label: 'ลูกเสือ / เนตรนารี / ยุวกาชาด',
      short_label: 'ลูกเสือ',
      description: 'บันทึกผลผ่านหรือไม่ผ่านกิจกรรมลูกเสือ เนตรนารี หรือยุวกาชาด',
      group_label: 'กิจกรรมพัฒนาผู้เรียน',
      sort_order: 2,
      is_active: true,
      score_type: 'pass_fail',
      max_score: 1,
      is_required: true,
      hours_per_year: 40,
    },
    {
      kind: 'activities',
      field_key: 'club_result',
      label: 'ชุมนุม / ชมรม',
      short_label: 'ชุมนุม',
      description: 'บันทึกผลผ่านหรือไม่ผ่านกิจกรรมชุมนุมหรือชมรม',
      group_label: 'กิจกรรมพัฒนาผู้เรียน',
      sort_order: 3,
      is_active: true,
      score_type: 'pass_fail',
      max_score: 1,
      is_required: true,
      hours_per_year: 30,
    },
    {
      kind: 'activities',
      field_key: 'public_service_result',
      label: 'กิจกรรมเพื่อสังคมและสาธารณประโยชน์',
      short_label: 'จิตอาสา',
      description: 'บันทึกผลผ่านหรือไม่ผ่านกิจกรรมเพื่อสังคมและสาธารณประโยชน์',
      group_label: 'กิจกรรมพัฒนาผู้เรียน',
      sort_order: 4,
      is_active: true,
      score_type: 'pass_fail',
      max_score: 1,
      is_required: true,
      hours_per_year: 10,
    },
  ],
  character: characterDefaultSettingsForBand('4'),
  reading: readingDefaultSettingsForBand('4'),
  competency: [
    'ความสามารถในการสื่อสาร',
    'ความสามารถในการคิด',
    'ความสามารถในการแก้ปัญหา',
    'ความสามารถในการใช้ทักษะชีวิต',
    'ความสามารถในการใช้เทคโนโลยี',
  ].map((label, index) => ({
    kind: 'competency' as const,
    field_key: `competency${index + 1}_score`,
    label,
    short_label: label.replace('ความสามารถในการ', ''),
    description: null,
    group_label: 'สมรรถนะสำคัญ',
    sort_order: index + 1,
    is_active: true,
    score_type: 'score_0_3' as const,
    max_score: 3,
    is_required: true,
    hours_per_year: 0,
  })),
}

export function normalizeEvaluationSetting(
  row: EvaluationSetting & { hours_per_year?: number | null; rubric_levels?: unknown },
): EvaluationSetting {
  const band = (row.education_band || '4') as EducationBand
  const defaults = row.kind === 'character'
    ? characterDefaultSettingsForBand(band).find(item => item.field_key === row.field_key)
    : row.kind === 'reading'
      ? readingDefaultSettingsForBand(band).find(item => item.field_key === row.field_key)
      : EVALUATION_DEFAULT_SETTINGS[row.kind]?.find(item => item.field_key === row.field_key)
  return {
    ...row,
    hours_per_year: Math.max(0, Number(row.hours_per_year ?? defaults?.hours_per_year ?? 0)),
    rubric_levels: normalizeRubricLevels(row.rubric_levels) ?? defaults?.rubric_levels ?? null,
  }
}

export function totalActiveActivityHours(
  settings: Array<Pick<EvaluationSetting, 'is_active' | 'hours_per_year'>>,
) {
  return settings
    .filter(setting => setting.is_active)
    .reduce((sum, setting) => sum + Math.max(0, Number(setting.hours_per_year || 0)), 0)
}

export function activityHoursForField(
  settings: Array<Pick<EvaluationSetting, 'field_key' | 'is_active' | 'hours_per_year'>>,
  fieldKey: string,
  fallback = 0,
) {
  const setting = settings.find(item => item.field_key === fieldKey)
  if (!setting || !setting.is_active) return 0
  return Math.max(0, Number(setting.hours_per_year ?? fallback))
}

export function activeEvaluationSettings(settings: EvaluationSetting[]) {
  return settings
    .filter(setting => setting.is_active)
    .sort((a, b) => compareEvaluationItemNumbers(a.short_label, b.short_label))
}

export function parseEvaluationItemNumber(value: string) {
  return value
    .trim()
    .split('.')
    .map(part => {
      const n = parseInt(part, 10)
      return Number.isFinite(n) ? n : 0
    })
}

export function compareEvaluationItemNumbers(a: string, b: string) {
  const left = parseEvaluationItemNumber(a)
  const right = parseEvaluationItemNumber(b)
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0)
    if (diff !== 0) return diff
  }
  return a.localeCompare(b, 'th')
}

export function sortOrderFromEvaluationItemNumber(value: string) {
  const parts = parseEvaluationItemNumber(value)
  if (parts.length <= 1) return (parts[0] ?? 0) * 1000
  return (parts[0] ?? 0) * 1000 + (parts[1] ?? 0)
}

export function isCharacterBehaviorItem(itemNumber: string) {
  return itemNumber.trim().includes('.')
}

export function isReadingStandardItem(itemNumber: string) {
  return !isCharacterBehaviorItem(itemNumber)
}

export function isReadingIndicatorItem(itemNumber: string) {
  return isCharacterBehaviorItem(itemNumber)
}

export function activeScorableEvaluationSettings(settings: EvaluationSetting[], kind: EvaluationKind) {
  const active = activeEvaluationSettings(settings)
  if (kind === 'character') return active.filter(setting => isReadingStandardItem(setting.short_label))
  if (kind === 'reading') return active.filter(setting => isReadingIndicatorItem(setting.short_label))
  return active
}

export function normalizeRubricLevels(value: unknown): RubricLevels | null {
  if (!value || typeof value !== 'object') return null
  const next: RubricLevels = {}
  for (const key of ['0', '1', '2', '3'] as RubricLevelKey[]) {
    const text = (value as Record<string, unknown>)[key]
    if (typeof text === 'string' && text.trim()) next[key] = text.trim()
  }
  return Object.keys(next).length > 0 ? next : null
}

export function validateCharacterEvaluationSetting(label: string, itemNumber: string, behavior: string | null) {
  const shortLabel = itemNumber.trim()
  const topic = label.trim()
  const description = behavior?.trim() || ''
  if (!shortLabel) return 'กรุณากรอกข้อที่'
  if (isCharacterBehaviorItem(shortLabel)) {
    if (!description) return 'กรุณากรอกพฤติกรรมบ่งชี้'
    return null
  }
  if (!topic) return 'กรุณากรอกหัวข้อ'
  return null
}

export function normalizeCharacterEvaluationPayload(
  label: string,
  itemNumber: string,
  behavior: string | null,
) {
  const shortLabel = itemNumber.trim()
  const topic = label.trim()
  const description = behavior?.trim() || null
  if (isCharacterBehaviorItem(shortLabel)) {
    return {
      label: topic || description || shortLabel,
      short_label: shortLabel,
      description,
      group_label: null,
      sort_order: sortOrderFromEvaluationItemNumber(shortLabel),
    }
  }
  return {
    label: topic,
    short_label: shortLabel,
    description: null,
    group_label: null,
    sort_order: sortOrderFromEvaluationItemNumber(shortLabel),
  }
}

export type CharacterGridRow = {
  itemNo: string
  detail: string
  settingId?: string
  fieldKey?: string
}

export function characterGridDisplayNumber(itemNumber: string) {
  const parts = parseEvaluationItemNumber(itemNumber)
  if (parts.length <= 1) return String(parts[0] ?? itemNumber.trim())
  return String(parts[1] ?? '')
}

export function characterSettingsToGridRows(settings: EvaluationSetting[]): CharacterGridRow[] {
  return settings
    .slice()
    .sort((a, b) => compareEvaluationItemNumbers(a.short_label, b.short_label))
    .map(setting => ({
      itemNo: characterGridDisplayNumber(setting.short_label),
      detail: isCharacterBehaviorItem(setting.short_label)
        ? (setting.description || setting.label)
        : setting.label,
      settingId: setting.id,
      fieldKey: setting.field_key,
    }))
}

export function parseCharacterGridRows(rows: Array<Pick<CharacterGridRow, 'itemNo' | 'detail'>>) {
  let mainTopicIndex = 0
  let lastBehaviorDisplayNum = 0
  let inBehaviorSection = false
  const parsed: Array<{ short_label: string; label: string; description: string | null }> = []

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]
    const detail = row.detail.trim()
    const itemNo = row.itemNo.trim()
    if (!itemNo && !detail) continue
    if (!detail) {
      return { rows: [] as typeof parsed, error: `แถวที่ ${index + 1}: กรุณากรอกรายละเอียด` }
    }

    const displayNum = parseInt(itemNo, 10)
    if (!Number.isFinite(displayNum) || displayNum <= 0) {
      return { rows: [] as typeof parsed, error: `แถวที่ ${index + 1}: ข้อที่ "${itemNo}" ไม่ถูกต้อง` }
    }

    if (!inBehaviorSection) {
      if (displayNum !== mainTopicIndex + 1) {
        return {
          rows: [] as typeof parsed,
          error: `แถวที่ ${index + 1}: หัวข้อหลักแรก/ถัดไปควรเป็นข้อที่ ${mainTopicIndex + 1}`,
        }
      }
      mainTopicIndex = displayNum
      parsed.push({
        short_label: String(mainTopicIndex),
        label: detail,
        description: null,
      })
      inBehaviorSection = true
      lastBehaviorDisplayNum = 0
      continue
    }

    if (displayNum === lastBehaviorDisplayNum + 1) {
      lastBehaviorDisplayNum = displayNum
      parsed.push({
        short_label: `${mainTopicIndex}.${displayNum}`,
        label: detail,
        description: detail,
      })
      continue
    }

    if (displayNum === mainTopicIndex + 1) {
      mainTopicIndex = displayNum
      parsed.push({
        short_label: String(mainTopicIndex),
        label: detail,
        description: null,
      })
      lastBehaviorDisplayNum = 0
      continue
    }

    return {
      rows: [] as typeof parsed,
      error: `แถวที่ ${index + 1}: ข้อที่ "${itemNo}" ไม่ต่อเนื่อง — ใช้ ${lastBehaviorDisplayNum + 1} สำหรับพฤติกรรมบ่งชี้ หรือ ${mainTopicIndex + 1} สำหรับหัวข้อหลัก`,
    }
  }

  if (parsed.length === 0) {
    return { rows: parsed, error: 'ยังไม่มีข้อมูลในตาราง' }
  }

  return { rows: parsed, error: null as string | null }
}

export function characterBehaviorsForTopic(settings: EvaluationSetting[], topicNumber: string) {
  const prefix = `${topicNumber.trim()}.`
  return settings
    .filter(setting => isCharacterBehaviorItem(setting.short_label) && setting.short_label.startsWith(prefix))
    .sort((a, b) => compareEvaluationItemNumbers(a.short_label, b.short_label))
    .map(setting => ({
      itemNo: characterGridDisplayNumber(setting.short_label),
      detail: setting.description || setting.label,
      settingId: setting.id,
      fieldKey: setting.field_key,
    }))
}

export type CharacterCriteriaTopic = {
  shortLabel: string
  label: string
  maxScore: number
  fieldKey: string
  behaviors: Array<{ shortLabel: string; label: string }>
}

export function characterCriteriaTopics(
  settings: Array<Pick<EvaluationSetting, 'field_key' | 'label' | 'short_label' | 'description' | 'sort_order' | 'is_active' | 'max_score'>>,
): CharacterCriteriaTopic[] {
  const active = activeEvaluationSettings(settings as EvaluationSetting[])
  return active
    .filter(setting => !isCharacterBehaviorItem(setting.short_label))
    .map(topic => ({
      shortLabel: topic.short_label,
      label: topic.label,
      maxScore: Number(topic.max_score || 3),
      fieldKey: topic.field_key,
      behaviors: characterBehaviorsForTopic(active, topic.short_label).map(behavior => {
        const setting = active.find(item => item.field_key === behavior.fieldKey)
        return {
          shortLabel: setting?.short_label || `${topic.short_label}.${behavior.itemNo}`,
          label: behavior.detail,
        }
      }),
    }))
}

const READING_CRITERIA_GROUP_ORDER = ['อ่าน', 'คิดวิเคราะห์', 'เขียน'] as const

export type ReadingCriteriaIndicator = {
  shortLabel: string
  label: string
  fieldKey: string
  maxScore: number
  rubricLevels: RubricLevels
}

export type ReadingCriteriaTopic = {
  shortLabel: string
  label: string
  maxScore: number
  fieldKey: string
  indicators: ReadingCriteriaIndicator[]
}

export type ReadingIndicatorGridRow = {
  itemNo: string
  detail: string
  rubric0: string
  rubric1: string
  rubric2: string
  rubric3: string
  settingId?: string
  fieldKey?: string
}

export function rubricLevelsToGridRow(levels: RubricLevels | null | undefined): Pick<ReadingIndicatorGridRow, 'rubric0' | 'rubric1' | 'rubric2' | 'rubric3'> {
  return {
    rubric0: levels?.['0'] || '',
    rubric1: levels?.['1'] || '',
    rubric2: levels?.['2'] || '',
    rubric3: levels?.['3'] || '',
  }
}

export function gridRowToRubricLevels(row: Pick<ReadingIndicatorGridRow, 'rubric0' | 'rubric1' | 'rubric2' | 'rubric3'>): RubricLevels {
  const next: RubricLevels = {}
  if (row.rubric0.trim()) next['0'] = row.rubric0.trim()
  if (row.rubric1.trim()) next['1'] = row.rubric1.trim()
  if (row.rubric2.trim()) next['2'] = row.rubric2.trim()
  if (row.rubric3.trim()) next['3'] = row.rubric3.trim()
  return next
}

export function readingIndicatorsForStandard(settings: EvaluationSetting[], standardNumber: string) {
  const prefix = `${standardNumber.trim()}.`
  return settings
    .filter(setting => isReadingIndicatorItem(setting.short_label) && setting.short_label.startsWith(prefix))
    .sort((a, b) => compareEvaluationItemNumbers(a.short_label, b.short_label))
    .map(setting => ({
      itemNo: characterGridDisplayNumber(setting.short_label),
      detail: setting.description || setting.label,
      settingId: setting.id,
      fieldKey: setting.field_key,
      ...rubricLevelsToGridRow(setting.rubric_levels),
    }))
}

export function readingCriteriaTopics(
  settings: Array<Pick<EvaluationSetting, 'field_key' | 'label' | 'short_label' | 'description' | 'group_label' | 'sort_order' | 'is_active' | 'max_score' | 'rubric_levels' | 'education_band'>>,
): ReadingCriteriaTopic[] {
  const active = activeEvaluationSettings(settings as EvaluationSetting[])
  const band = ((active[0]?.education_band || '4') as EducationBand)
  const standards = active.filter(setting => isReadingStandardItem(setting.short_label))

  if (standards.length > 0) {
    return standards.map(standard => {
      const indicators = readingIndicatorsForStandard(active, standard.short_label)
      return {
        shortLabel: standard.short_label,
        label: standard.label,
        maxScore: indicators.reduce((sum, item) => sum + 3, 0) || Number(standard.max_score || 0),
        fieldKey: standard.field_key,
        indicators: indicators.map(item => {
          const setting = active.find(entry => entry.field_key === item.fieldKey)
          return {
            shortLabel: setting?.short_label || `${standard.short_label}.${item.itemNo}`,
            label: item.detail,
            fieldKey: item.fieldKey || setting?.field_key || '',
            maxScore: Number(setting?.max_score || 3),
            rubricLevels: normalizeRubricLevels(setting?.rubric_levels)
              || readingRubricForIndicator(band, setting?.short_label || '')
              || {},
          }
        }),
      }
    })
  }

  const grouped = new Map<string, EvaluationSetting[]>()
  for (const setting of active.filter(item => isReadingIndicatorItem(item.short_label))) {
    const group = setting.group_label?.trim() || 'อื่นๆ'
    const items = grouped.get(group) || []
    items.push(setting as EvaluationSetting)
    grouped.set(group, items)
  }

  const orderedGroups = [
    ...READING_CRITERIA_GROUP_ORDER.filter(group => grouped.has(group)),
    ...[...grouped.keys()].filter(group => !READING_CRITERIA_GROUP_ORDER.includes(group as typeof READING_CRITERIA_GROUP_ORDER[number])),
  ]

  return orderedGroups.map((group, topicIndex) => {
    const items = (grouped.get(group) || []).slice().sort((a, b) => a.sort_order - b.sort_order)
    const topicNo = String(topicIndex + 1)
    return {
      shortLabel: topicNo,
      label: group === 'อ่าน' ? 'การอ่าน' : group === 'คิดวิเคราะห์' ? 'การคิดวิเคราะห์' : group === 'เขียน' ? 'การเขียน' : group,
      maxScore: items.reduce((sum, item) => sum + Math.max(0, Number(item.max_score || 3)), 0),
      fieldKey: `reading_standard_${topicNo}`,
      indicators: items.map(item => ({
        shortLabel: item.short_label,
        label: item.label,
        fieldKey: item.field_key,
        maxScore: Number(item.max_score || 3),
        rubricLevels: normalizeRubricLevels(item.rubric_levels) || {},
      })),
    }
  })
}

export function parseReadingIndicatorRows(
  standardNumber: string,
  rows: Array<Pick<ReadingIndicatorGridRow, 'itemNo' | 'detail' | 'rubric0' | 'rubric1' | 'rubric2' | 'rubric3'>>,
) {
  const mainStandard = parseInt(standardNumber.trim(), 10)
  if (!Number.isFinite(mainStandard) || mainStandard <= 0) {
    return { rows: [] as Array<{ short_label: string; label: string; description: string; rubric_levels: RubricLevels }>, error: 'มาตรฐานที่ไม่ถูกต้อง' }
  }

  const parsed: Array<{ short_label: string; label: string; description: string; rubric_levels: RubricLevels }> = []
  let lastDisplayNum = 0

  for (let index = 0; index < rows.length; index += 1) {
    const detail = rows[index].detail.trim()
    const itemNo = rows[index].itemNo.trim()
    if (!itemNo && !detail && !rows[index].rubric0 && !rows[index].rubric1 && !rows[index].rubric2 && !rows[index].rubric3) continue
    if (!detail) {
      return { rows: [], error: `แถวตัวชี้วัดที่ ${index + 1}: กรุณากรอกรายละเอียด` }
    }

    const displayNum = (() => {
      if (itemNo.includes('.')) {
        const parts = parseEvaluationItemNumber(itemNo)
        if (parts[0] === mainStandard && (parts[1] ?? 0) > 0) return parts[1] ?? 0
        if ((parts[1] ?? 0) > 0) return parts[parts.length - 1] ?? 0
      }
      return parseInt(itemNo, 10)
    })()
    if (!Number.isFinite(displayNum) || displayNum <= 0) {
      return { rows: [], error: `แถวตัวชี้วัดที่ ${index + 1}: ข้อที่ "${itemNo}" ไม่ถูกต้อง` }
    }
    if (displayNum !== lastDisplayNum + 1) {
      return { rows: [], error: `แถวตัวชี้วัดที่ ${index + 1}: ข้อที่ควรเป็น ${lastDisplayNum + 1}` }
    }

    lastDisplayNum = displayNum
    const shortLabel = `${mainStandard}.${displayNum}`
    parsed.push({
      short_label: shortLabel,
      label: detail,
      description: detail,
      rubric_levels: gridRowToRubricLevels(rows[index]),
    })
  }

  return { rows: parsed, error: null as string | null }
}

export function validateReadingEvaluationSetting(label: string, itemNumber: string) {
  const shortLabel = itemNumber.trim()
  const topic = label.trim()
  if (!shortLabel) return 'กรุณากรอกมาตรฐานที่'
  if (isReadingIndicatorItem(shortLabel)) return 'กรุณาแก้ไขผ่านมาตรฐานหลัก'
  if (!topic) return 'กรุณากรอกชื่อมาตรฐาน'
  return null
}

export function normalizeReadingStandardPayload(label: string, itemNumber: string, groupLabel: string | null) {
  return {
    label: label.trim(),
    short_label: itemNumber.trim(),
    description: null,
    group_label: groupLabel?.trim() || null,
    sort_order: sortOrderFromEvaluationItemNumber(itemNumber.trim()),
  }
}

export function parseCharacterBehaviorRows(
  topicNumber: string,
  rows: Array<Pick<CharacterGridRow, 'itemNo' | 'detail'>>,
) {
  const mainTopic = parseInt(topicNumber.trim(), 10)
  if (!Number.isFinite(mainTopic) || mainTopic <= 0) {
    return { rows: [] as Array<{ short_label: string; label: string; description: string }>, error: 'ข้อที่หัวข้อหลักไม่ถูกต้อง' }
  }

  const parsed: Array<{ short_label: string; label: string; description: string }> = []
  let lastDisplayNum = 0

  for (let index = 0; index < rows.length; index += 1) {
    const detail = rows[index].detail.trim()
    const itemNo = rows[index].itemNo.trim()
    if (!itemNo && !detail) continue
    if (!detail) {
      return { rows: [], error: `แถวพฤติกรรมที่ ${index + 1}: กรุณากรอกรายละเอียด` }
    }

    const displayNum = (() => {
      if (itemNo.includes('.')) {
        const parts = parseEvaluationItemNumber(itemNo)
        if (parts[0] === mainTopic && (parts[1] ?? 0) > 0) return parts[1] ?? 0
        if ((parts[1] ?? 0) > 0) return parts[parts.length - 1] ?? 0
      }
      return parseInt(itemNo, 10)
    })()
    if (!Number.isFinite(displayNum) || displayNum <= 0) {
      return { rows: [], error: `แถวพฤติกรรมที่ ${index + 1}: ข้อที่ "${itemNo}" ไม่ถูกต้อง` }
    }
    if (displayNum !== lastDisplayNum + 1) {
      return {
        rows: [],
        error: `แถวพฤติกรรมที่ ${index + 1}: ข้อที่ควรเป็น ${lastDisplayNum + 1}`,
      }
    }

    lastDisplayNum = displayNum
    parsed.push({
      short_label: `${mainTopic}.${displayNum}`,
      label: detail,
      description: detail,
    })
  }

  return { rows: parsed, error: null as string | null }
}
