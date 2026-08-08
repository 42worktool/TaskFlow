// 브라우저 기본 UI에 의존하지 않는 날짜 선택기의 파싱·이동·월 그리드 계산을 제공한다.
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
  // 정오를 사용해 DST 전환일에도 날짜 연산이 전날/다음 날로 밀릴 가능성을 줄인다.
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
  // YYYY-MM-DD는 자리수가 고정되어 문자열 비교가 시간순 비교와 같다.
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
  // 1월 31일에서 2월로 이동할 때 넘치지 않고 대상 월의 마지막 날에 고정한다.
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

  // 앞뒤 달을 포함한 6주(42칸)를 고정해 월 이동 때 팝오버 높이가 흔들리지 않게 한다.
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
