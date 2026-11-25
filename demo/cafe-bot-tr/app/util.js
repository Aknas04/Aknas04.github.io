// Small helpers shared by the bot: text, money, phone, time and date parsing.

export const cut = (s, n) => {
  s = String(s ?? '').trim()
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…'
}

// Text for matching: lower case, ё→е, Turkish letters folded (ç→c, ş→s, ğ→g, ı/İ→i, ö→o, ü→u)
// so "çocuk" and "cocuk" match; punctuation → spaces. Keywords go through the same function.
const FOLD = { ı: 'i', ş: 's', ğ: 'g', ç: 'c', ö: 'o', ü: 'u', â: 'a', î: 'i', û: 'u' }
export const norm = (s) =>
  String(s ?? '')
    .replace(/İ/g, 'i')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[ışğçöüâîû]/g, (c) => FOLD[c])
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// non-breaking spaces so "5 580 ₸" never wraps in the middle
export const money = (n, cur) => `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ${cur}`

export function phoneFmt(wa) {
  const d = String(wa || '').replace(/\D/g, '')
  let m
  if ((m = d.match(/^7(\d{3})(\d{3})(\d{2})(\d{2})$/))) return `+7 ${m[1]} ${m[2]} ${m[3]} ${m[4]}`
  if ((m = d.match(/^90(\d{3})(\d{3})(\d{2})(\d{2})$/))) return `+90 ${m[1]} ${m[2]} ${m[3]} ${m[4]}`
  return d ? `+${d}` : ''
}

// Current local date (YYYY-MM-DD) and minutes since midnight in the cafe's time zone
export function localNow(tz, at = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(at).map((x) => [x.type, x.value]),
  )
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: +p.hour * 60 + +p.minute }
}

export const hm = (s) => {
  const [h, m] = String(s).split(':').map(Number)
  return h * 60 + (m || 0)
}
export const fmtHM = (min) => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

// Opening hours "09:00"–"23:00"; close before open means the cafe works past midnight
export function isOpenAt(b, min) {
  const o = hm(b.open), c = hm(b.close)
  if (o === c) return true
  return c > o ? min >= o && min < c : min >= o || min < c
}

// Last table booking is one hour before closing
export function lastBooking(b) {
  return (hm(b.close) - 60 + 1440) % 1440
}
export function canBookAt(b, min) {
  const o = hm(b.open), last = lastBooking(b)
  if (o === hm(b.close)) return true
  return last >= o ? min >= o && min <= last : min >= o || min <= last
}

export function parseTime(text) {
  const t = String(text).toLowerCase()
  let m = t.match(/(\d{1,2})\s*[:.\-ч]\s*(\d{2})/) || t.match(/\b(\d{1,2})\s+(\d{2})\b/)
  let h, mi
  if (m) { h = +m[1]; mi = +m[2] }
  else if ((m = t.match(/\b(\d{1,2})\b/))) { h = +m[1]; mi = 0 }
  else return null
  if (/вечер|дня|pm|akşam|aksam|öğleden sonra|ogleden sonra/.test(t) && h < 12) h += 12
  if (h === 24 && mi === 0) h = 0
  if (h > 23 || mi > 59) return null
  return h * 60 + mi
}

const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

export function addDays(day, n) {
  const [y, m, d] = day.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate())
}

export const daysBetween = (a, b) => {
  const f = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) }
  return Math.round((f(b) - f(a)) / 864e5)
}

// Words for relative days and month stems come from the language file (texts/*.js → dateWords).
const RU_DATES = {
  plus2: ['послезавтра', 'бүрсігүні'],
  plus1: ['завтра', 'ертең'],
  today: ['сегодня', 'бүгін'],
  months: ['янв', 'фев', 'мар', 'апр', 'ма', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'],
}

// "сегодня", "завтра", "28.11", "28/11/2026", "28 ноября", "yarın", "28 Kasım" → YYYY-MM-DD (null if not a date)
export function parseDate(text, today, words = RU_DATES) {
  const t = norm(text)
  const has = (list) => (list || []).some((w) => t.includes(norm(w)))
  if (has(words.plus2)) return addDays(today, 2) // checked first: "послезавтра" contains "завтра"
  if (has(words.plus1)) return addDays(today, 1)
  if (has(words.today)) return today
  const ty = +today.slice(0, 4)
  let d, mo, y = null, m
  if ((m = String(text).match(/(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?/))) {
    d = +m[1]; mo = +m[2]; y = m[3] ? +m[3] : null
  } else if ((m = t.match(/(\d{1,2}) ?(\p{L}{2,})/u))) {
    d = +m[1]
    mo = (words.months || []).findIndex((st) => m[2].startsWith(norm(st))) + 1
    if (!mo) return null
  } else return null
  if (y !== null && y < 100) y += 2000
  if (mo < 1 || mo > 12 || d < 1) return null
  const dim = new Date(Date.UTC(y ?? ty, mo, 0)).getUTCDate()
  if (d > dim) return null
  if (y === null) {
    y = ty
    if (iso(y, mo, d) < today) y++
  }
  return iso(y, mo, d)
}
