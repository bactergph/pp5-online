import type { ReadingCriteriaTopic } from './evaluation-settings'

export const READING_SCORE_KEYS = [
  'reading_1_1',
  'reading_1_2',
  'thinking_2_1',
  'thinking_2_2',
  'writing_3_1',
] as const

export const READING_GRAND_TOTAL_MAX = 15

export type ReadingTableScoreColumn = {
  kind: 'score'
  key: string
  label: string
  max: number
}

export type ReadingTableSpacerColumn = {
  kind: 'spacer'
}

export type ReadingTableTotalColumn = {
  kind: 'total'
  label: string
  max: number
  totalOf: string[]
}

export type ReadingTableColumn = ReadingTableScoreColumn | ReadingTableSpacerColumn | ReadingTableTotalColumn

export type ReadingTableGroup = {
  key: string
  label: string
  columns: ReadingTableColumn[]
}

const DEFAULT_GROUPS: ReadingTableGroup[] = [
  {
    key: 'reading',
    label: '1. การอ่าน',
    columns: [
      { kind: 'score', key: 'reading_1_1', label: '1.1', max: 3 },
      { kind: 'score', key: 'reading_1_2', label: '1.2', max: 3 },
      { kind: 'total', label: 'เต็ม', max: 6, totalOf: ['reading_1_1', 'reading_1_2'] },
    ],
  },
  {
    key: 'thinking',
    label: '2. การคิดวิเคราะห์',
    columns: [
      { kind: 'score', key: 'thinking_2_1', label: '2.1', max: 3 },
      { kind: 'score', key: 'thinking_2_2', label: '2.2', max: 3 },
      { kind: 'total', label: 'เต็ม', max: 6, totalOf: ['thinking_2_1', 'thinking_2_2'] },
    ],
  },
  {
    key: 'writing',
    label: '3. การเขียน',
    columns: [
      { kind: 'score', key: 'writing_3_1', label: '3.1', max: 3 },
      { kind: 'spacer' },
      { kind: 'total', label: 'เต็ม', max: 3, totalOf: ['writing_3_1'] },
    ],
  },
]

function isWritingGroup(topic: Pick<ReadingCriteriaTopic, 'shortLabel' | 'label'>) {
  return topic.shortLabel === '3' || topic.label.includes('เขียน')
}

function buildGroupFromTopic(topic: ReadingCriteriaTopic): ReadingTableGroup {
  const scoreColumns: ReadingTableScoreColumn[] = topic.indicators.map(indicator => ({
    kind: 'score',
    key: indicator.fieldKey,
    label: indicator.shortLabel,
    max: indicator.maxScore || 3,
  }))
  const totalOf = topic.indicators.map(indicator => indicator.fieldKey)
  const columns: ReadingTableColumn[] = [
    ...scoreColumns,
    ...(isWritingGroup(topic) && scoreColumns.length === 1 ? [{ kind: 'spacer' as const }] : []),
    {
      kind: 'total',
      label: 'เต็ม',
      max: topic.maxScore || totalOf.length * 3,
      totalOf,
    },
  ]

  return {
    key: topic.shortLabel,
    label: `${topic.shortLabel}. ${topic.label}`,
    columns,
  }
}

export function defaultReadingTableGroups(): ReadingTableGroup[] {
  return DEFAULT_GROUPS
}

export function readingTableGroupsFromTopics(topics: ReadingCriteriaTopic[]): ReadingTableGroup[] {
  if (topics.length === 0) return defaultReadingTableGroups()
  return topics.map(buildGroupFromTopic)
}

export function readingTableFlatColumns(groups: ReadingTableGroup[]): ReadingTableColumn[] {
  return groups.flatMap(group => group.columns)
}

export function readingTableColumnValue(
  row: Record<string, string | number | null> | null,
  column: ReadingTableColumn,
): string | number {
  if (!row) return ''
  if (column.kind === 'spacer') return ''
  if (column.kind === 'total') {
    return column.totalOf.reduce((sum, key) => sum + Number(row[key] ?? 0), 0)
  }
  return row[column.key] ?? ''
}

export function readingTableColumnMax(column: ReadingTableColumn): string | number {
  if (column.kind === 'spacer') return ''
  return column.max
}
