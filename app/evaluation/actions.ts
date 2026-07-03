'use server'

import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import { logActivity, resolveClassroomSchoolId } from '@/lib/audit'
import {
  EVALUATION_DEFAULT_SETTINGS,
  READING_SCORE_FIELD_KEYS,
  activeEvaluationSettings,
  activeScorableEvaluationSettings,
  characterDefaultSettingsForBand,
  educationBandFromClassroomLevel,
  evaluationBandForKind,
  isBandedEvaluationKind,
  normalizeEvaluationSetting,
  readingDefaultSettingsForBand,
  type EducationBand,
  type EvaluationKind,
  type EvaluationSetting,
} from '@/lib/evaluation-settings'

export type { EvaluationKind } from '@/lib/evaluation-settings'

type EvaluationRowInput = {
  student_id: string
  values: Record<string, number | string | null>
}

type CustomScoreRow = {
  student_id: string
  field_key: string
  value_score: number | null
  value_text: string | null
}

const CAN_EDIT = ['admin', 'district', 'academic_head', 'deputy_principal', 'teacher']

async function requireSession() {
  const session = await getSession()
  if (!session) throw new Error('ไม่มีสิทธิ์')
  return session
}

function resultLevel(total: number, max: number) {
  const percent = max > 0 ? (total / max) * 100 : 0
  if (percent >= 80) return 'ดีเยี่ยม'
  if (percent >= 65) return 'ดี'
  if (percent >= 50) return 'ผ่าน'
  return 'ไม่ผ่าน'
}

function defaultSettingsForKind(kind: EvaluationKind, educationBand?: EducationBand): EvaluationSetting[] {
  if (kind === 'character') {
    return characterDefaultSettingsForBand((educationBand || '1') as EducationBand) as EvaluationSetting[]
  }
  if (kind === 'reading') {
    return readingDefaultSettingsForBand((educationBand || '1') as EducationBand) as EvaluationSetting[]
  }
  return EVALUATION_DEFAULT_SETTINGS[kind] as EvaluationSetting[]
}

async function fetchSettingsForSchool(schoolId: string, kind: EvaluationKind, educationBand?: EducationBand) {
  const band = evaluationBandForKind(kind, educationBand)
  const db = createServerClient()
  const { data, error } = await db.from('evaluation_settings')
    .select('id, kind, field_key, label, short_label, description, group_label, sort_order, is_active, score_type, max_score, is_required, hours_per_year, rubric_levels, education_band')
    .eq('school_id', schoolId)
    .eq('kind', kind)
    .eq('education_band', band)
    .order('sort_order')

  if (error) {
    return {
      settings: defaultSettingsForKind(kind, educationBand),
      error: error.message.includes('evaluation_settings') ? 'ยังไม่ได้ติดตั้งตาราง evaluation_settings กรุณา apply migration 016_evaluation_settings.sql' : error.message,
    }
  }

  if (!data?.length) {
    return {
      settings: defaultSettingsForKind(kind, educationBand),
      error: null,
    }
  }

  return { settings: (data || []).map(row => normalizeEvaluationSetting({ ...(row as EvaluationSetting), kind })), error: null }
}

export async function fetchEvaluationInit() {
  const session = await requireSession()
  const db = createServerClient()
  const { data } = await db.from('academic_years')
    .select('id, year_be, is_active')
    .eq('school_id', session.schoolId || '')
    .order('year_be', { ascending: false })

  return {
    canEdit: CAN_EDIT.includes(session.role),
    years: data || [],
  }
}

export async function fetchEvaluationClassrooms(yearId: string) {
  const session = await requireSession()
  const db = createServerClient()
  const { data } = await db.from('classrooms')
    .select('id, level, room')
    .eq('school_id', session.schoolId || '')
    .eq('academic_year_id', yearId)
    .order('level')
    .order('room')

  return data || []
}

export async function fetchEvaluationData(kind: EvaluationKind, classroomId: string, academicYearId: string, term: 1 | 2) {
  const session = await requireSession()
  const db = createServerClient()
  const schoolId = session.schoolId || await resolveClassroomSchoolId(classroomId)

  let criteriaBand: EducationBand | undefined
  if (isBandedEvaluationKind(kind)) {
    const { data: classroom } = await db.from('classrooms')
      .select('level')
      .eq('id', classroomId)
      .maybeSingle()
    criteriaBand = educationBandFromClassroomLevel(classroom?.level || '')
  }

  const settingsResult = schoolId
    ? await fetchSettingsForSchool(schoolId, kind, criteriaBand)
    : {
      settings: (kind === 'character'
        ? characterDefaultSettingsForBand(criteriaBand || '4')
        : kind === 'reading'
          ? readingDefaultSettingsForBand(criteriaBand || '4')
          : EVALUATION_DEFAULT_SETTINGS[kind]) as EvaluationSetting[],
      error: 'ยังไม่ได้เลือกโรงเรียน',
    }
  const { data: students } = await db.from('students')
    .select('id, student_number, student_code, prefix, first_name, last_name, status')
    .eq('classroom_id', classroomId)
    .order('student_number')

  const studentIds = (students || []).map((student: { id: string }) => student.id)
  if (studentIds.length === 0) return { students: [], rows: [], settings: settingsResult.settings, error: settingsResult.error }

  const base = { academic_year_id: academicYearId }
  let table = 'character_traits'
  let query = db.from(table).select('*')

  if (kind === 'activities') {
    table = 'activities_evaluation'
    query = db.from(table).select('*')
      .eq('academic_year_id', academicYearId)
      .in('student_id', studentIds)
  } else if (kind === 'reading') {
    table = 'reading_evaluation'
    query = db.from(table).select('*')
      .eq('academic_year_id', academicYearId)
      .eq('term', term)
      .in('student_id', studentIds)
  } else if (kind === 'competency') {
    table = 'competency_evaluation'
    query = db.from(table).select('*')
      .eq('academic_year_id', academicYearId)
      .eq('term', term)
      .in('student_id', studentIds)
  } else {
    query = db.from(table).select('*')
      .eq('academic_year_id', base.academic_year_id)
      .eq('term', term)
      .in('student_id', studentIds)
  }

  const { data, error } = await query
  if (error) {
    return {
      students: students || [],
      rows: [],
      settings: settingsResult.settings,
      error: kind === 'competency' && (error.code === 'PGRST205' || error.message.includes('competency_evaluation'))
        ? 'ยังไม่ได้ติดตั้งตาราง competency_evaluation กรุณา apply migration 015_competency_evaluation.sql'
        : settingsResult.error || error.message,
    }
  }

  const activeKeys = new Set(activeScorableEvaluationSettings(settingsResult.settings, kind).map(setting => setting.field_key))
  const defaultKeys = new Set(
    kind === 'reading'
      ? READING_SCORE_FIELD_KEYS
      : EVALUATION_DEFAULT_SETTINGS[kind].map(setting => setting.field_key),
  )
  const customKeys = [...activeKeys].filter(key => !defaultKeys.has(key))
  if (customKeys.length === 0) {
    return { students: students || [], rows: data || [], settings: settingsResult.settings, error: settingsResult.error }
  }

  const customResult = await db.from('evaluation_custom_scores')
    .select('student_id, field_key, value_score, value_text')
    .eq('school_id', schoolId)
    .eq('kind', kind)
    .eq('academic_year_id', academicYearId)
    .eq('term', kind === 'activities' ? 0 : term)
    .in('student_id', studentIds)
    .in('field_key', customKeys)

  const rows = (data || []).map(row => ({ ...row }))
  const rowMap = new Map(rows.map(row => [String(row.student_id), row]))
  for (const studentId of studentIds) {
    if (!rowMap.has(studentId)) {
      const row = { student_id: studentId, academic_year_id: academicYearId, ...(kind === 'activities' ? {} : { term }) }
      rows.push(row)
      rowMap.set(studentId, row)
    }
  }
  for (const custom of (customResult.data || []) as CustomScoreRow[]) {
    const row = rowMap.get(custom.student_id)
    if (!row) continue
    row[custom.field_key] = custom.value_text ?? custom.value_score ?? null
  }

  return {
    students: students || [],
    rows,
    settings: settingsResult.settings,
    error: settingsResult.error || (customResult.error ? 'ยังไม่ได้ติดตั้งตาราง evaluation_custom_scores กรุณา apply migration 018_evaluation_custom_scores.sql' : null),
  }
}

export async function saveEvaluationRows(
  kind: EvaluationKind,
  classroomId: string,
  academicYearId: string,
  term: 1 | 2,
  rows: EvaluationRowInput[],
) {
  const session = await requireSession()
  if (!CAN_EDIT.includes(session.role)) return { error: 'ไม่มีสิทธิ์' }
  if (!rows.length) return { error: 'ไม่มีข้อมูล' }

  const db = createServerClient()
  const schoolId = await resolveClassroomSchoolId(classroomId)
  const settingsResult = await fetchSettingsForSchool(schoolId, kind)
  const activeSettings = activeScorableEvaluationSettings(settingsResult.settings, kind)
  const activeScoreSettings = activeSettings.filter(setting => setting.score_type === 'score_0_3')
  const maxScore = activeScoreSettings.reduce((sum, setting) => sum + Number(setting.max_score || 0), 0)
  const defaultKeys = kind === 'reading'
    ? [...READING_SCORE_FIELD_KEYS]
    : EVALUATION_DEFAULT_SETTINGS[kind].map(setting => setting.field_key)
  const defaultKeySet = new Set(defaultKeys)
  const customSettings = activeSettings.filter(setting => !defaultKeySet.has(setting.field_key))

  let table = 'character_traits'
  let payload: Record<string, unknown>[] = []

  if (kind === 'activities') {
    table = 'activities_evaluation'
    payload = rows.map(row => {
      const values = row.values
      const results = activeSettings
        .filter(setting => setting.score_type === 'pass_fail')
        .map(setting => setting.field_key)
        .map(key => values[key])
        .filter(Boolean)
      const overall = results.length === 0
        ? null
        : results.every(value => value === 'ผ่าน') ? 'ผ่าน' : 'ไม่ผ่าน'

      return {
        student_id: row.student_id,
        academic_year_id: academicYearId,
        ...Object.fromEntries(defaultKeys.map(key => [key, values[key] || null])),
        overall_result: overall,
      }
    })
  } else if (kind === 'reading') {
    table = 'reading_evaluation'
    payload = rows.map(row => {
      const total = activeScoreSettings.reduce((sum, setting) => sum + Number(row.values[setting.field_key] || 0), 0)
      return {
        student_id: row.student_id,
        academic_year_id: academicYearId,
        term,
        evaluation_level: null,
        ...Object.fromEntries(defaultKeys.map(key => [key, row.values[key] ?? 0])),
        total_score: total,
        result_level: resultLevel(total, maxScore),
      }
    })
  } else if (kind === 'competency') {
    table = 'competency_evaluation'
    payload = rows.map(row => {
      const total = activeScoreSettings.reduce((sum, setting) => sum + Number(row.values[setting.field_key] || 0), 0)
      return {
        student_id: row.student_id,
        academic_year_id: academicYearId,
        term,
        ...Object.fromEntries(defaultKeys.map(key => [key, row.values[key] ?? 0])),
        total_score: total,
        result_level: resultLevel(total, maxScore),
      }
    })
  } else {
    payload = rows.map(row => {
      const total = activeScoreSettings.reduce((sum, setting) => sum + Number(row.values[setting.field_key] || 0), 0)
      return {
        student_id: row.student_id,
        academic_year_id: academicYearId,
        term,
        ...Object.fromEntries(defaultKeys.map(key => [key, row.values[key] ?? 0])),
        total_score: total,
        percentage: Math.round((maxScore > 0 ? total / maxScore : 0) * 10000) / 100,
        result_level: resultLevel(total, maxScore),
      }
    })
  }

  const { error } = await db.from(table).upsert(payload, { onConflict: kind === 'activities' ? 'student_id,academic_year_id' : 'student_id,academic_year_id,term' })
  if (error) {
    return {
      error: kind === 'competency' && (error.code === 'PGRST205' || error.message.includes('competency_evaluation'))
        ? 'ยังไม่ได้ติดตั้งตาราง competency_evaluation กรุณา apply migration 015_competency_evaluation.sql'
        : error.message,
      count: payload.length,
    }
  }

  if (customSettings.length > 0) {
    const customRows = rows.flatMap(row => customSettings.map(setting => {
      const value = row.values[setting.field_key]
      return {
        school_id: schoolId,
        kind,
        student_id: row.student_id,
        academic_year_id: academicYearId,
        term: kind === 'activities' ? 0 : term,
        field_key: setting.field_key,
        value_score: setting.score_type === 'score_0_3' ? Number(value || 0) : null,
        value_text: setting.score_type === 'pass_fail' ? String(value || '') || null : null,
        updated_at: new Date().toISOString(),
      }
    }))
    const { error: customError } = await db.from('evaluation_custom_scores')
      .upsert(customRows, { onConflict: 'school_id,kind,student_id,academic_year_id,term,field_key' })
    if (customError) {
      return {
        error: customError.message.includes('evaluation_custom_scores')
          ? 'ยังไม่ได้ติดตั้งตาราง evaluation_custom_scores กรุณา apply migration 018_evaluation_custom_scores.sql'
          : customError.message,
        count: payload.length,
      }
    }
  }

  {
    await logActivity({
      actor: session,
      schoolId,
      action: 'upsert',
      module: `evaluation_${kind}`,
      targetType: 'classroom',
      targetId: classroomId,
      description: `บันทึกการประเมิน ${kind} จำนวน ${payload.length} คน`,
      metadata: { kind, classroomId, academicYearId, term, count: payload.length },
    })
  }

  return { error: null, count: payload.length }
}
