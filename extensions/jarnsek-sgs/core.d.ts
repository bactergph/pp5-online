export type ScorePacket = { format: 'jarnsek-sgs-scores'; version: 1; context: {yearBe: number; term: 1 | 2; classroom: string; subjectCode: string; subjectName: string}; columns: {key: string; label: string; max: number}[]; students: {studentCode: string; name: string; values: (number | null)[]}[] }
export type TargetRow = {studentCode: string; cells: {label: string; value: string; editable: boolean; max?: number | null}[]}
export type ScoreChange = {row: number; column: number; studentCode: string; label: string; before: string; value: number}
export type TransferPlan = {changes: ScoreChange[]; issues: string[]; issueCount: number; studentCount: number}
export const FORMAT: 'jarnsek-sgs-scores'
export function studentCode(value: unknown): string
export function parsePacket(input: unknown): ScorePacket
export function parseGrid(input: string): (number | null)[][]
export function planPacket(input: unknown, targets: TargetRow[], mapping: number[], overwrite?: boolean): TransferPlan
export function planGrid(grid: (number | null)[][], targets: TargetRow[], startRow: number, startColumn: number, overwrite?: boolean): TransferPlan
export function verifyReceipt(receipt: {changes: ScoreChange[]}, targets: TargetRow[]): {checked: number; mismatches: (ScoreChange & {actual: string | null})[]}
