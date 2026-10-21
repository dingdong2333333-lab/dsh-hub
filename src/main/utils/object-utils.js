/** Small object helpers shared by services. Keep them dependency-free. */

export function deepMerge(base, patch) {
  if (!isPlainObject(base) || !isPlainObject(patch)) return clone(patch);
  const out = clone(base);
  for (const [key, value] of Object.entries(patch)) {
    if (isPlainObject(value) && isPlainObject(out[key])) out[key] = deepMerge(out[key], value);
    else out[key] = clone(value);
  }
  return out;
}

export function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

export function clone(value) {
  if (value == null || typeof value !== 'object') return value;
  return structuredClone(value);
}

export function pick(object, keys) {
  const out = {};
  for (const key of keys) if (object[key] !== undefined) out[key] = object[key];
  return out;
}

export function uniqueBy(list, keyFn) {
  const seen = new Set();
  return list.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
