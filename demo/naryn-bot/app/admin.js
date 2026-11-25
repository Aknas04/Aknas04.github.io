// Read-only page with orders and bookings (backup for what the admin gets in WhatsApp).
import { money, localNow, fmtHM } from './util.js'
import ru from './texts/ru.js'

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

export function adminPage(client, store, { sim = false, refresh = true } = {}) {
  const { cafe } = client
  const tz = cafe.timezone || 'UTC'
  const $ = (n) => money(n, cafe.currency || '₸')
  const branch = (id) => cafe.branches?.find((b) => b.id === id)?.title || ''
  const when = (at) => {
    const t = localNow(tz, new Date(at))
    return `${t.date.slice(8, 10)}.${t.date.slice(5, 7)} ${fmtHM(t.minutes)}`
  }
  const orders = [...store.list('orders')].reverse().slice(0, 200)
  const bookings = [...store.list('bookings')].sort((a, b) => (b.date + fmtHM(b.time)).localeCompare(a.date + fmtHM(a.time))).slice(0, 200)

  const orderRows = orders.map((o) => `<tr>
    <td>№${o.id}<br><small>${when(o.at)}</small></td>
    <td>${esc(o.name)}<br><small>${esc(o.phone)}</small></td>
    <td>${o.lines.map((l) => `${esc(l.name)} × ${l.qty}`).join('<br>')}</td>
    <td class="num">${$(o.total)}</td>
    <td>${o.ship === 'delivery' ? `Доставка: ${esc(o.address)}` : `Самовывоз: ${esc(branch(o.branch))}, ${esc(o.when)}`}<br><small>${esc(o.pay)}${o.comment ? ` · ${esc(o.comment)}` : ''}</small></td>
    <td>${ru.status[o.status] || o.status}</td></tr>`).join('')

  const bookingRows = bookings.map((r) => `<tr>
    <td>№${r.id}</td>
    <td>${esc(ru.dateFmt(r.date))}, ${fmtHM(r.time)}</td>
    <td>${esc(r.name)}<br><small>${esc(r.phone)}</small></td>
    <td>${esc(ru.guests(r.guests))}</td>
    <td>${esc(branch(r.branch))}${r.seat ? `<br><small>${esc(r.seat)}</small>` : ''}${r.comment ? `<br><small>${esc(r.comment)}</small>` : ''}</td>
    <td>${ru.status[r.status] || r.status}</td></tr>`).join('')

  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(cafe.name)} · заказы${sim ? ' (симулятор)' : ''}</title>${refresh ? '<meta http-equiv="refresh" content="20">' : ''}
<style>
:root{--bg:#f6f5f2;--card:#fff;--ink:#1d1b18;--mute:#6f6a62;--line:#e6e2da}
@media (prefers-color-scheme:dark){:root{--bg:#141311;--card:#1d1b18;--ink:#f1ede6;--mute:#a39d93;--line:#34302a}}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1100px;margin:0 auto;padding:24px 16px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 10px}
p{color:var(--mute);margin:0}
.wrap{overflow-x:auto;background:var(--card);border:1px solid var(--line);border-radius:12px}
table{border-collapse:collapse;width:100%;min-width:720px}
td,th{padding:10px 12px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
th{font-size:13px;color:var(--mute);font-weight:600}
tr:last-child td{border-bottom:0}small{color:var(--mute)}.num{font-variant-numeric:tabular-nums;white-space:nowrap}
.empty{padding:16px;color:var(--mute)}
</style></head><body><main>
<h1>${esc(cafe.name)}: заказы и брони${sim ? ' (симулятор)' : ''}</h1>
<p>${refresh ? 'Страница обновляется каждые 20 секунд.' : 'Снимок на момент открытия. Чтобы увидеть новые заказы, откройте страницу заново.'}</p>
<h2>Заказы</h2>
<div class="wrap">${orders.length ? `<table><tr><th>№</th><th>Гость</th><th>Блюда</th><th>Сумма</th><th>Получение</th><th>Статус</th></tr>${orderRows}</table>` : '<div class="empty">Заказов пока нет.</div>'}</div>
<h2>Брони</h2>
<div class="wrap">${bookings.length ? `<table><tr><th>№</th><th>Когда</th><th>Гость</th><th>Гостей</th><th>Где</th><th>Статус</th></tr>${bookingRows}</table>` : '<div class="empty">Броней пока нет.</div>'}</div>
</main></body></html>`
}
