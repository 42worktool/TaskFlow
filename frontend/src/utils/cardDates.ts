export function toDateInput(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return localDate.toISOString().slice(0, 10)
}

export function toIsoDate(value: string): string | null {
  if (!value) return null
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day).toISOString()
}

export function isDateRangeValid(start: string, end: string): boolean {
  return !start || !end || start <= end
}
