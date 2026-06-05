import { formatTechnicalLabel } from './formatters'

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

export type FieldCounterResult = {
  empty: number
  filled: number
  percentage: number
  total: number
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isEmptyValue(value: unknown) {
  return value === null || value === undefined || value === ''
}

export function humanizeJsonKey(key: string) {
  return formatTechnicalLabel(key)
}

export function countJsonFields(value: unknown): FieldCounterResult {
  const result = { empty: 0, filled: 0, percentage: 0, total: 0 }

  function visit(item: unknown) {
    if (Array.isArray(item)) {
      if (!item.length) {
        result.total += 1
        result.empty += 1
        return
      }

      item.forEach(visit)
      return
    }

    if (isPlainObject(item)) {
      const entries = Object.values(item)

      if (!entries.length) {
        result.total += 1
        result.empty += 1
        return
      }

      entries.forEach(visit)
      return
    }

    result.total += 1
    if (isEmptyValue(item)) {
      result.empty += 1
    } else {
      result.filled += 1
    }
  }

  visit(value)
  result.percentage = result.total ? Math.round((result.filled / result.total) * 100) : 0
  return result
}

export function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return isPlainObject(value)
}
