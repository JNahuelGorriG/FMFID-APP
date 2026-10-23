/**
 * Lee un valor dentro de un objeto con una ruta tipo "a.b.c".
 * Con `allowMissingLeaf`, una última clave que no existe devuelve undefined.
 */
export function getIn(target: unknown, path: string, allowMissingLeaf = false): unknown {
  const keys = path.split('.')
  let current: unknown = target
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    if (current === null || typeof current !== 'object') {
      throw new Error(`La ruta "${path}" no existe.`)
    }
    if (!(key in current)) {
      if (allowMissingLeaf && i === keys.length - 1) return undefined
      throw new Error(`La ruta "${path}" no existe.`)
    }
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

/**
 * Devuelve una copia del objeto con el valor de la ruta reemplazado.
 * La ruta debe existir, salvo la última clave si `allowMissingLeaf` es verdadero.
 */
export function setIn<T>(target: T, path: string, value: unknown, allowMissingLeaf = false): T {
  const keys = path.split('.')
  const update = (node: unknown, index: number): unknown => {
    const key = keys[index]
    const last = index === keys.length - 1
    if (node === null || typeof node !== 'object' || (!(key in node) && !(allowMissingLeaf && last))) {
      throw new Error(`La ruta "${path}" no existe.`)
    }
    const copy: Record<string, unknown> = { ...(node as Record<string, unknown>) }
    copy[key] = last ? value : update(copy[key], index + 1)
    return copy
  }
  return update(target, 0) as T
}
