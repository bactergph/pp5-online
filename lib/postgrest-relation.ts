/** A to-one join must contain exactly one row; never authorize using an arbitrary first row. */
export function relationOne<T>(value: T | readonly T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value.length === 1 ? value[0] : null
  return value == null ? null : value as T
}
