// API의 ISO 시각과 날짜 입력 컴포넌트의 YYYY-MM-DD 값을 로컬 날짜 기준으로 변환한다.
export function toDateInput(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return localDate.toISOString().slice(0, 10)
}

export function toIsoDate(value: string): string | null {
  if (!value) return null
  const [year, month, day] = value.split('-').map(Number)
  // 문자열을 UTC 자정으로 해석하지 않고 사용자의 로컬 날짜 자정으로 만들어 날짜 밀림을 막는다.
  return new Date(year, month - 1, day).toISOString()
}

export function isDateRangeValid(start: string, end: string): boolean {
  return !start || !end || start <= end
}
