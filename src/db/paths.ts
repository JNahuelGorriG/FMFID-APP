/** Lee un valor dentro de un objeto con una ruta tipo "a.b.c". */
export function getIn(target: unknown, path: string): unknown {
  let current: unknown = target
  for (const key of path.split('.')) {
    if (current === null || typeof current !== 'object' || !(key in current)) {
      throw new Error(`La ruta "${path}" no existe.`)
    }
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

/** Devuelve una copia del objeto con el valor de la ruta reemplazado. La ruta debe existir. */
export function setIn<T>(target: T, path: string, value: unknown): T {
  const keys = path.split('.')
  const update = (node: unknown, index: number): unknown => {
    const key = keys[index]
    if (node === null || typeof node !== 'object' || !(key in node)) {
      throw new Error(`La ruta "${path}" no existe.`)
    }
    const copy: Record<string, unknown> = { ...(node as Record<string, unknown>) }
    copy[key] = index === keys.length - 1 ? value : update(copy[key], index + 1)
    return copy
  }
  return update(target, 0) as T
}
