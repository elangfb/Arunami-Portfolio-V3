import { MONTH_OPTIONS, parsePeriodKey } from '@/lib/dateUtils'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

interface Props {
  value: string // "YYYY-MM"
  onChange: (value: string) => void
  disabled?: boolean
}

const currentYear = new Date().getFullYear()
const YEAR_OPTIONS = Array.from({ length: 6 }, (_, i) => String(currentYear - 2 + i))

export function MonthYearPicker({ value, onChange, disabled }: Props) {
  const parsed = parsePeriodKey(value)
  const selectedMonth = parsed?.month ?? ''
  const selectedYear = parsed?.year ?? ''

  const handleMonth = (m: string) => {
    const y = selectedYear || String(currentYear)
    onChange(`${y}-${m}`)
  }

  const handleYear = (y: string) => {
    const m = selectedMonth || '01'
    onChange(`${y}-${m}`)
  }

  return (
    <div className="flex gap-2">
      <Select value={selectedMonth || undefined} onValueChange={handleMonth} disabled={disabled}>
        <SelectTrigger className="text-sm flex-1">
          <SelectValue placeholder="Bulan" />
        </SelectTrigger>
        <SelectContent>
          {MONTH_OPTIONS.map(o => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={selectedYear || undefined} onValueChange={handleYear} disabled={disabled}>
        <SelectTrigger className="text-sm w-[100px]">
          <SelectValue placeholder="Tahun" />
        </SelectTrigger>
        <SelectContent>
          {YEAR_OPTIONS.map(y => (
            <SelectItem key={y} value={y}>{y}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
