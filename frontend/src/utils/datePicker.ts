export interface DatePickerDay {
  value: string
  day: number
  inCurrentMonth: boolean
  isToday: boolean
  disabled: boolean
}

const DATE_VALUE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function dateValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function parseDateValue(value: string): Date | null {
  const match = DATE_VALUE_PATTERN.exec(value)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day, 12)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null
  }
  return date
}

export function formatDateValue(value: string): string {
  const date = parseDateValue(value)
  if (!date) return '날짜 선택'
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`
}

export function clampDateValue(value: string, min?: string, max?: string): string {
  if (min && value < min) return min
  if (max && value > max) return max
  return value
}

export function moveDateByDays(value: string, amount: number): string {
  const date = parseDateValue(value)
  if (!date) return value
  date.setDate(date.getDate() + amount)
  return dateValue(date)
}

export function moveDateByMonths(value: string, amount: number): string {
  const date = parseDateValue(value)
  if (!date) return value

  const targetYear = date.getFullYear()
  const targetMonth = date.getMonth() + amount
  const targetDay = Math.min(date.getDate(), new Date(targetYear, targetMonth + 1, 0, 12).getDate())
  return dateValue(new Date(targetYear, targetMonth, targetDay, 12))
}

export function buildDatePickerDays(
  year: number,
  month: number,
  min?: string,
  max?: string,
  today = new Date(),
): DatePickerDay[] {
  const firstDay = new Date(year, month - 1, 1, 12)
  const gridStart = new Date(year, month - 1, 1 - firstDay.getDay(), 12)
  const todayValue = dateValue(today)

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart)
    date.setDate(gridStart.getDate() + index)
    const value = dateValue(date)
    return {
      value,
      day: date.getDate(),
      inCurrentMonth: date.getMonth() === month - 1,
      isToday: value === todayValue,
      disabled: Boolean((min && value < min) || (max && value > max)),
    }
  })
}

export function monthHasSelectableDate(
  year: number,
  month: number,
  min?: string,
  max?: string,
): boolean {
  const first = dateValue(new Date(year, month - 1, 1, 12))
  const last = dateValue(new Date(year, month, 0, 12))
  return !((min && last < min) || (max && first > max))
}
