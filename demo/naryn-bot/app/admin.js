// Read-only page with orders and bookings (backup for what the admin gets in WhatsApp).
import { money, localNow, fmtHM } from './util.js'
import { textsFor } from './texts/index.js'

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

export function adminPage(client, store, { sim = false, refresh = true } = {}) {
  const { cafe } = client
  const T = textsFor(cafe.lang)
  const A = T.admin
  const C = A.cols
  const tz = cafe.timezone || 'UTC'
  const $ = (n) => money(n, cafe.currency || '₸')
  const branch = (id) => cafe.branches?.find((b) => b.id === id)?.title || ''
  const when = (at) => {
    const t = localNow(tz, new Date(at))
    return `${t.date.slice(8, 10)}.${t.date.slice(5, 7)} ${fmtHM(t.minutes)}`
  }
  const status = (s) => T.status[s] || s
  const orders = [...store.list('orders')].reverse().slice(0, 200)
  const bookings = [...store.list('bookings')]
    .sort((a, b) => (b.date + fmtHM(b.time)).localeCompare(a.date + fmtHM(a.time)))
    .slice(0, 200)

  const orderRows = orders.map((o) => `<tr>
    <td>${esc(C.no)}${o.id}<br><small>${when(o.at)}</small></td>
    <td>${esc(o.name)}<br><small>${esc(o.phone)}</small></td>
    <td>${o.lines.map((l) => `${esc(l.name)} × ${l.qty}`).join('<br>')}</td>
    <td class="num">${$(o.total)}</td>
    <td>${o.ship === 'delivery' ? `${esc(A.delivery)}: ${esc(o.address)}` : `${esc(A.pickup)}: ${esc(branch(o.branch))}, ${esc(o.when)}`}<br><small>${esc(o.pay)}${o.comment ? ` · ${esc(o.comment)}` : ''}</small></td>
    <td>${status(o.status)}</td></tr>`).join('')

  const bookingRows = bookings.map((r) => `<tr>
    <td>${esc(C.no)}${r.id}</td>
    <td>${esc(T.dateFmt(r.date))}, ${fmtHM(r.time)}</td>
    <td>${esc(r.name)}<br><small>${esc(r.phone)}</small></td>
    <td>${esc(T.guests(r.guests))}</td>
    <td>${esc(branch(r.branch))}${r.seat ? `<br><small>${esc(r.seat)}</small>` : ''}${r.comment ? `<br><small>${esc(r.comment)}</small>` : ''}</td>
    <td>${status(r.status)}</td></tr>`).join('')

  const title = `${cafe.name}: ${A.title}${sim ? A.sim : ''}`
  return `<!doctype html><html lang="${A.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>${refresh ? '<meta http-equiv="refresh" content="20">' : ''}
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
<h1>${esc(title)}</h1>
<p>${esc(refresh ? A.refresh : A.snapshot)}</p>
<h2>${esc(A.orders)}</h2>
<div class="wrap">${orders.length ? `<table><tr><th>${esc(C.no)}</th><th>${esc(C.guest)}</th><th>${esc(C.items)}</th><th>${esc(C.sum)}</th><th>${esc(C.receive)}</th><th>${esc(C.status)}</th></tr>${orderRows}</table>` : `<div class="empty">${esc(A.noOrders)}</div>`}</div>
<h2>${esc(A.bookings)}</h2>
<div class="wrap">${bookings.length ? `<table><tr><th>${esc(C.no)}</th><th>${esc(C.when)}</th><th>${esc(C.guest)}</th><th>${esc(C.guests)}</th><th>${esc(C.where)}</th><th>${esc(C.status)}</th></tr>${bookingRows}</table>` : `<div class="empty">${esc(A.noBookings)}</div>`}</div>
</main></body></html>`
}
