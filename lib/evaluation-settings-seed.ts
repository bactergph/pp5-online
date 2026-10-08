import { createServerClient } from '@/lib/supabase'
import { EDUCATION_BAND_OPTIONS, type EducationBand } from '@/lib/character-band-defaults'
import {
  EVALUATION_DEFAULT_SETTINGS,
  characterDefaultSettingsForBand,
  evaluationBandForKind,
  readingDefaultSettingsForBand,
  type EvaluationKind,
} from '@/lib/evaluation-settings'

const ALL_BANDS = EDUCATION_BAND_OPTIONS.map(option => option.value)

export function buildDefaultEvaluationRows(
  schoolId: string,
  kind: EvaluationKind,
  educationBand?: EducationBand,
) {
  const band = evaluationBandForKind(kind, educationBand)
  if (kind === 'character') {
    return characterDefaultSettingsForBand(band as EducationBand).map(setting => ({
      ...setting,
      school_id: schoolId,
      education_band: band,
    }))
  }
  if (kind === 'reading') {
    return readingDefaultSettingsForBand(band as EducationBand).map(setting => ({
      ...setting,
      school_id: schoolId,
      education_band: band,
    }))
  }
  return EVALUATION_DEFAULT_SETTINGS[kind].map(setting => ({
    ...setting,
    school_id: schoolId,
    education_band: band,
  }))
}

export function allDefaultEvaluationRowsForSchool(schoolId: string) {
  const kinds = ['activities', 'competency'] as const
  return [
    ...kinds.flatMap(kind => buildDefaultEvaluationRows(schoolId, kind)),
    ...ALL_BANDS.flatMap(band => buildDefaultEvaluationRows(schoolId, 'character', band)),
    ...ALL_BANDS.flatMap(band => buildDefaultEvaluationRows(schoolId, 'reading', band)),
  ]
}

export async function seedEvaluationSettingsForSchool(schoolId: string, preserveExisting = false) {
  const db = createServerClient()
  const rows = allDefaultEvaluationRowsForSchool(schoolId)
  const { error } = await db.from('evaluation_settings').upsert(rows, {
    onConflict: 'school_id,kind,education_band,field_key',
    ignoreDuplicates: preserveExisting,
  })
  return { error: error?.message ?? null, count: rows.length }
}

export async function deleteEvaluationSettingsForSchool(schoolId: string) {
  const db = createServerClient()
  const { error, count } = await db.from('evaluation_settings')
    .delete({ count: 'exact' })
    .eq('school_id', schoolId)
  return { error: error?.message ?? null, count: count ?? 0 }
}
