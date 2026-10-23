export interface PathChange {
  path: string
  value: unknown
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    return [...keys].every((k) => deepEqual(a[k], b[k]))
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]))
  }
  return false
}

/** Campos que no cuentan como cambios del usuario. */
const IGNORED = new Set(['id', 'createdAt', 'updatedAt'])

/**
 * Lista los cambios entre dos versiones de un objeto, uno por cada dato que difiere.
 * Si un valor pasa de nulo a objeto (o al revés), el cambio es del objeto completo.
 */
export function diffPaths(before: unknown, after: unknown, prefix = ''): PathChange[] {
  if (deepEqual(before, after)) return []
  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)])
    return [...keys].flatMap((key) =>
      prefix === '' && IGNORED.has(key)
        ? []
        : diffPaths(before[key], after[key], prefix === '' ? key : `${prefix}.${key}`),
    )
  }
  return [{ path: prefix, value: after }]
}
