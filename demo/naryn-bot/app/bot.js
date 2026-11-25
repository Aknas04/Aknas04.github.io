// Conversation logic. Knows nothing about HTTP: gets an incoming WhatsApp message,
// sends answers through `transport` (Cloud API or the simulator).
import * as W from './wa.js'
import {
  cut, norm, money, phoneFmt, localNow, hm, fmtHM, isOpenAt, canBookAt, lastBooking,
  parseTime, parseDate, addDays, daysBetween,
} from './util.js'
import ru from './texts/ru.js'

const LANGS = { ru }
const PAGE = 8 // list rows per page (+ up to 2 navigation rows = 10, the WhatsApp limit)
const HOUR = 3600e3
const HANDOFF_MS = 2 * HOUR // how long the bot stays silent after "call the admin"
const STALE_MS = 3 * HOUR // an unfinished checkout is forgotten after this
const CART_TTL = 24 * HOUR
const MAX_QTY = 50
const BOOK_DAYS_AHEAD = 60

export function createBot({ client, store, transport, owners = [], mediaBase = null, ownerTemplate = null, log = console }) {
  const { cafe, cats, items, catById } = client
  const T = LANGS[cafe.lang] || ru
  const $ = (n) => money(n, cafe.currency || '₸')
  const tz = cafe.timezone || 'UTC'
  const branches = cafe.branches || []
  const branchById = (id) => branches.find((b) => b.id === id) || null
  const orderCfg = { enabled: true, delivery: true, pickup: true, payments: [], ...cafe.order }
  const bookCfg = { enabled: true, seats: [], maxGuests: 30, ...cafe.booking }
  const phones = branches.map((b) => b.phone).filter(Boolean)
  const isOwner = (id) => owners.includes(id)
  const now = () => localNow(tz)
  const nameOf = (s) => s.customName || s.profile || ''
  const mapsLink = (loc) => `https://maps.google.com/?q=${loc.latitude},${loc.longitude}`
  const index = [...items.values()].map((it) => ({ it, words: norm(it.name).split(' ') }))

  // ───────────────────────── sending ─────────────────────────

  async function send(to, msg) {
    try {
      return await transport.send(to, msg)
    } catch (e) {
      log.error(`[wa] не отправлено → ${to}: ${e.message}`)
      return null
    }
  }

  // Messages to the cafe staff. We remember which customer each one is about,
  // so the admin can answer the customer by replying (swipe) to it.
  async function sendOwner(o, msg, meta = {}) {
    try {
      const id = await transport.send(o, msg)
      if (id) store.remember(id, { to: o, msg, ...meta })
      return id
    } catch (e) {
      log.error(`[wa] администратору ${o}: ${e.message}`)
      if (e.code === 131047) await queueOwner(o, { msg, ...meta })
      return null
    }
  }
  const toOwners = async (msg, meta) => {
    for (const o of owners) await sendOwner(o, msg, meta)
  }

  // WhatsApp only lets a business write freely within 24 h of the person's last message.
  // If the admin has been silent longer, keep notifications and (optionally) send a template.
  async function queueOwner(o, entry) {
    const q = store.pending(o)
    q.push(entry)
    if (q.length > 50) q.shift()
    store.save()
    if (!ownerTemplate) return
    const os = store.session(o)
    if (Date.now() - (os.templateAt || 0) < 10 * 60e3) return
    os.templateAt = Date.now()
    await send(o, W.template(ownerTemplate.name, ownerTemplate.lang, [entry.summary || T.owner.newEvent]))
  }
  async function flushOwner(o) {
    const q = store.pending(o)
    if (!q.length) return
    const list = q.splice(0)
    store.save()
    for (const e of list) await sendOwner(o, e.msg, { customer: e.customer, summary: e.summary })
  }

  // ───────────────────────── entry points ─────────────────────────

  const queues = new Map()
  // one message at a time per person, so fast taps don't race
  function handleIncoming(evt) {
    const key = evt.from
    const p = (queues.get(key) || Promise.resolve())
      .then(() => processMessage(evt))
      .catch((e) => log.error('[bot]', e))
    queues.set(key, p)
    p.finally(() => queues.get(key) === p && queues.delete(key))
    return p
  }

  async function handleStatus(st) {
    if (st.status !== 'failed') return
    const err = st.errors?.[0] || {}
    log.warn(`[wa] не доставлено → ${st.recipient_id}: ${err.code} ${err.title || err.message || ''}`)
    const rec = store.recall(st.id)
    if (!rec) return
    if (err.code === 131047 && isOwner(rec.to) && rec.msg) return queueOwner(rec.to, { msg: rec.msg, customer: rec.customer, summary: rec.summary })
    if (rec.relayOwner) return sendOwner(rec.relayOwner, W.text(T.owner.relayFailed(err.code === 131047, phoneFmt(rec.to))))
  }

  async function processMessage({ from, name, message }) {
    if (!message?.id || store.seen(message.id)) return
    await transport.markRead?.(message.id)
    const input = parse(message)

    if (isOwner(from)) {
      await flushOwner(from)
      const os = store.session(from)
      if (input.kind === 'action' && /^(ord|bk|chat):/.test(input.id)) return ownerAction(from, input.id)
      if (!os.asCustomer) return ownerFlow(from, input, os)
      if (input.kind === 'text' && T.words.admin.includes(norm(input.text))) {
        os.asCustomer = false
        store.save()
        return send(from, W.text(T.owner.backToAdmin))
      }
    }

    const s = store.session(from)
    s.wa = from
    if (name) s.profile = name
    const t = Date.now()
    if (s.at && t - s.at > STALE_MS) reset(s)
    if (s.at && t - s.at > CART_TTL) s.cart = []
    s.at = t
    let out
    try {
      out = await route(from, s, input)
    } catch (e) {
      log.error('[bot]', e)
      reset(s)
      out = [W.text(T.oops)]
    }
    store.save()
    for (const m of out || []) if (m) await send(from, m)
  }

  function parse(m) {
    const base = { mid: m.id, ctx: m.context?.id || null }
    switch (m.type) {
      case 'text':
        return { ...base, kind: 'text', text: m.text?.body || '' }
      case 'interactive': {
        const r = m.interactive?.button_reply || m.interactive?.list_reply
        return r ? { ...base, kind: 'action', id: r.id, text: r.title } : { ...base, kind: 'other', type: m.interactive?.type }
      }
      case 'button': // quick-reply button of a template
        return { ...base, kind: 'action', id: m.button?.payload || '', text: m.button?.text || '' }
      case 'location':
        return { ...base, kind: 'location', loc: m.location || {} }
      default:
        return { ...base, kind: 'other', type: m.type }
    }
  }

  // ───────────────────────── customer ─────────────────────────

  const reset = (s) => {
    s.step = 'idle'
    s.draft = {}
  }

  async function route(from, s, input) {
    if (s.handoff) {
      const exit = input.kind === 'action' || (input.kind === 'text' && T.words.exitHandoff.includes(norm(input.text)))
      if (Date.now() > s.handoff.until || exit) s.handoff = null
      else {
        s.handoff.until = Date.now() + HANDOFF_MS
        await forwardToOwners(from, s, input)
        return []
      }
    }
    switch (input.kind) {
      case 'action':
        return onAction(from, s, input.id)
      case 'location':
        return onLocation(s, input.loc)
      case 'text':
        return onText(from, s, input.text)
      default:
        if (['reaction', 'sticker', 'unsupported', 'system', 'ephemeral', 'order'].includes(input.type)) return []
        return [W.text(T.onlyText), ...home(s, false)]
    }
  }

  async function onAction(from, s, id) {
    const p = id.split(':')
    switch (p[0]) {
      case 'home': reset(s); return home(s, false)
      case 'menu': return categories(p[1] === 'p' ? +p[2] : 0)
      case 'cat': {
        const cat = catById.get(p[1])
        return cat ? categoryItems(cat, p[2] === 'p' ? +p[3] : 0) : expired(s)
      }
      case 'item': {
        const it = items.get(p[1])
        return it ? itemCard(s, it) : expired(s)
      }
      case 'add': return askQty(s, p[1], p[2] == null ? null : +p[2])
      case 'qty': return addToCart(s, +p[1])
      case 'cart':
        if (p[1] === 'edit') return cartEdit(s)
        if (p[1] === 'rm') return cartRemove(s, +p[2])
        if (p[1] === 'clear') { s.cart = []; return [W.buttons(T.cartCleared, [{ id: 'menu', title: T.btn.menu }, { id: 'home', title: T.btn.home }])] }
        return cart(s)
      case 'checkout': return startCheckout(s)
      case 'ship': {
        const d = s.draft.order
        if (!d) return expired(s)
        d.ship = p[1] === 'delivery' ? 'delivery' : 'pickup'
        return orderNext(from, s)
      }
      case 'ob': {
        const d = s.draft.order
        if (!d || !branchById(p[1])) return expired(s)
        d.branch = p[1]
        return orderNext(from, s)
      }
      case 'when': {
        const d = s.draft.order
        if (!d) return expired(s)
        d.when = p[1] === 'asap' ? T.asap : T.byTime(fmtHM(now().minutes + +p[1]))
        return orderNext(from, s)
      }
      case 'pay': {
        const d = s.draft.order
        const pay = orderCfg.payments[+p[1]]
        if (!d || !pay) return expired(s)
        d.pay = pay
        return orderNext(from, s)
      }
      case 'order':
        if (p[1] === 'ok') return confirmOrder(from, s)
        if (p[1] === 'note') {
          if (!s.draft.order) return expired(s)
          s.step = 'comment'
          return [W.text(T.askComment)]
        }
        if (p[1] === 'cancel') {
          reset(s)
          return [W.text(T.orderCancelled), ...home(s, false)]
        }
        return expired(s)
      case 'book':
        if (p[1] === 'ok') return confirmBooking(from, s)
        if (p[1] === 'note') {
          if (!s.draft.book) return expired(s)
          s.step = 'book_comment'
          return [W.text(T.askWish)]
        }
        if (p[1] === 'cancel') {
          reset(s)
          return [W.text(T.bookCancelled), ...home(s, false)]
        }
        return startBooking(from, s)
      case 'bb': {
        const d = s.draft.book
        if (!d || !branchById(p[1])) return expired(s)
        d.branch = p[1]
        return bookNext(from, s)
      }
      case 'bd': {
        const d = s.draft.book
        if (!d) return expired(s)
        return setDate(from, s, addDays(now().date, +p[1]))
      }
      case 'bt': return setTime(from, s, +p[1])
      case 'bg': return setGuests(from, s, +p[1])
      case 'bs': {
        const d = s.draft.book
        if (!d) return expired(s)
        d.seat = p[1] === 'any' ? null : bookCfg.seats[+p[1]] ?? null
        return bookNext(from, s)
      }
      case 'info': return info()
      case 'human': return startHandoff(from, s)
      default: return home(s, false)
    }
  }

  // text typed while the bot waits for a specific answer
  const TEXT_STEPS = {
    qty: (from, s, raw) => {
      const n = parseInt(raw.match(/\d+/)?.[0], 10)
      return n ? addToCart(s, n) : [W.text(T.badQty(MAX_QTY))]
    },
    ship: (from, s, raw, t) => {
      if (/достав|привез/.test(t)) s.draft.order.ship = 'delivery'
      else if (/самовывоз|забер|сам/.test(t)) s.draft.order.ship = 'pickup'
      else return [W.text(T.useButtons), ...askShip(s)]
      return orderNext(from, s)
    },
    addr: (from, s, raw) => {
      if (raw.trim().length < 5) return [W.text(T.addrTooShort)]
      s.draft.order.address = cut(raw, 200)
      s.draft.order.loc = null
      return orderNext(from, s)
    },
    branch: (from, s, raw, t) => {
      const b = branches.find((x) => norm(x.title).split(' ').some((w) => w.length > 3 && t.includes(w)))
      if (!b) return [W.text(T.useButtons), ...askBranch(s, s.draft.branchFor)]
      if (s.draft.branchFor === 'bb') { s.draft.book.branch = b.id; return bookNext(from, s) }
      s.draft.order.branch = b.id
      return orderNext(from, s)
    },
    pickup_time: (from, s, raw) => {
      const m = parseTime(raw)
      s.draft.order.when = m != null ? T.byTime(fmtHM(m)) : cut(raw, 60)
      return orderNext(from, s)
    },
    comment: (from, s, raw) => {
      s.draft.order.comment = cut(raw, 200)
      return orderNext(from, s)
    },
    confirm: (from, s, raw, t) => {
      if (T.words.yes.includes(t)) return confirmOrder(from, s)
      s.draft.order.comment = cut(raw, 200)
      return orderNext(from, s)
    },
    name: (from, s, raw) => {
      if (raw.trim().length < 2) return [W.text(T.askName)]
      s.customName = cut(raw, 40)
      return s.draft.after === 'book' ? bookNext(from, s) : orderNext(from, s)
    },
    book_date: (from, s, raw) => {
      const d = parseDate(raw, now().date)
      return d ? setDate(from, s, d) : [W.text(T.badDate)]
    },
    book_time: (from, s, raw) => setTime(from, s, parseTime(raw)),
    book_guests: (from, s, raw) => setGuests(from, s, parseInt(raw.match(/\d+/)?.[0], 10)),
    book_seat: (from, s, raw) => {
      s.draft.book.seat = cut(raw, 60)
      return bookNext(from, s)
    },
    book_comment: (from, s, raw) => {
      s.draft.book.comment = cut(raw, 200)
      return bookNext(from, s)
    },
    book_confirm: (from, s, raw, t) => {
      if (T.words.yes.includes(t)) return confirmBooking(from, s)
      s.draft.book.comment = cut(raw, 200)
      return bookNext(from, s)
    },
  }
  const ORDER_STEPS = new Set(['ship', 'addr', 'branch', 'pickup_time', 'comment', 'confirm', 'name', 'pay'])
  const BOOK_STEPS = new Set(['book_date', 'book_time', 'book_guests', 'book_seat', 'book_comment', 'book_confirm'])

  async function onText(from, s, raw) {
    const t = norm(raw)
    if (T.words.menu.includes(t)) { reset(s); return categories(0) }
    if (T.words.home.includes(t)) { reset(s); return home(s, true) }
    if (T.words.cancel.includes(t)) {
      const had = s.step !== 'idle'
      reset(s)
      return [W.text(had ? T.cancelled : T.nothingToCancel), ...home(s, false)]
    }
    if (T.words.cart.includes(t)) { reset(s); return cart(s) }

    // the step's draft may be gone (old session) — then treat as free text
    const draftOk =
      (ORDER_STEPS.has(s.step) && s.draft.order) ||
      (BOOK_STEPS.has(s.step) && s.draft.book) ||
      (s.step === 'qty' && s.draft.pending) ||
      (s.step === 'name' && (s.draft.order || s.draft.book)) ||
      (s.step === 'branch' && (s.draft.order || s.draft.book))
    if (draftOk) {
      if (TEXT_STEPS[s.step]) return TEXT_STEPS[s.step](from, s, raw, t)
      if (s.step === 'pay') return [W.text(T.useButtons), ...askPay(s)]
    }
    reset(s)
    return freeText(from, s, t)
  }

  function onLocation(s, loc) {
    const d = s.draft.order
    if (s.step === 'addr' && d) {
      d.loc = { latitude: loc.latitude, longitude: loc.longitude }
      d.address = [loc.name, loc.address].filter(Boolean).join(', ') || T.geoAddress
      return orderNext(s.wa, s)
    }
    return [W.text(T.locationThanks), ...home(s, false)]
  }

  async function freeText(from, s, t) {
    if (!t) return home(s, !s.greeted)
    for (const f of cafe.faq || []) {
      if (f.keywords?.some((k) => t.includes(norm(k)))) return [W.buttons(f.answer, quickNav())]
    }
    const intent = T.intents.find(([re]) => re.test(t))?.[1]
    if (intent === 'human') return startHandoff(from, s)
    if (intent === 'info') return info()
    if (intent === 'book') return startBooking(from, s)

    const found = search(t)
    if (found.length === 1) return itemCard(s, found[0])
    if (found.length) {
      const rows = found.slice(0, 9).map((it) => ({ id: `item:${it.id}`, title: it.name, description: itemDesc(it) }))
      rows.push({ id: 'menu', title: T.fullMenu, description: T.fullMenuDesc(items.size) })
      return [W.list(T.found(found.length), T.btn.dishes, [{ title: T.foundTitle, rows }])]
    }
    switch (intent) {
      case 'order': return s.cart.length ? cart(s) : [W.text(T.howToOrder), ...categories(0)]
      case 'menu': return categories(0)
      case 'thanks': return [W.text(T.thanks)]
      case 'greet': return home(s, true)
    }
    if (!s.greeted) return home(s, true)
    return [W.text(T.notUnderstood), ...home(s, false)]
  }

  function search(t) {
    const toks = t.split(' ').filter((w) => w.length >= 3 && !T.words.stop.includes(w))
    if (!toks.length) return []
    const stems = toks.map((w) => (w.length >= 6 ? w.slice(0, -2) : w.length >= 4 ? w.slice(0, -1) : w))
    let best = 0
    let res = []
    for (const { it, words } of index) {
      const score = stems.filter((st) => words.some((w) => w.startsWith(st))).length
      if (!score) continue
      if (score > best) { best = score; res = [it] } else if (score === best) res.push(it)
    }
    return res
  }

  const quickNav = () => [
    { id: 'menu', title: T.btn.menu },
    bookCfg.enabled ? { id: 'book', title: T.btn.book } : { id: 'info', title: T.btn.info },
    { id: 'home', title: T.btn.home },
  ]

  function expired(s) {
    reset(s)
    return [W.text(T.expired), ...home(s, false)]
  }

  // ───────── main menu, food menu, dish card ─────────

  function home(s, greet) {
    s.greeted = true
    const n = now().minutes
    const open = branches.some((b) => isOpenAt(b, n))
    const lines = cartLines(s)
    const rows = [
      { id: 'menu', title: T.home.menu, description: T.home.menuDesc(items.size) },
      lines.length ? { id: 'cart', title: T.home.cart, description: T.home.cartDesc(lines.length, $(totalOf(lines))) } : null,
      bookCfg.enabled ? { id: 'book', title: T.home.book, description: T.home.bookDesc } : null,
      { id: 'info', title: T.home.info, description: open ? T.home.openNow : T.home.closedNow },
      { id: 'human', title: T.home.human, description: T.home.humanDesc },
    ]
    return [
      W.list(greet ? T.welcome(nameOf(s), cafe) : T.whatNext, T.btn.homeList, [{ title: cafe.name, rows }], {
        footer: cafe.tagline ? `${cafe.name} · ${cafe.tagline}` : cafe.name,
      }),
    ]
  }

  function paginate(rows, page, base) {
    if (rows.length <= 10) return rows
    const pages = Math.ceil(rows.length / PAGE)
    page = Math.max(0, Math.min(page || 0, pages - 1))
    const out = rows.slice(page * PAGE, page * PAGE + PAGE)
    if (page > 0) out.push({ id: `${base}:p:${page - 1}`, title: T.prevPage, description: T.pageOf(page, pages) })
    if (page < pages - 1) out.push({ id: `${base}:p:${page + 1}`, title: T.nextPage, description: T.pageOf(page + 2, pages) })
    return out
  }

  const priceMin = (it) => (it.variants ? Math.min(...it.variants.map((v) => v.price)) : it.price)
  const priceText = (it) => (it.variants ? T.priceFrom($(priceMin(it))) : $(it.price))
  const itemDesc = (it) => [it.name.length > 24 ? it.name : null, priceText(it), it.desc || null].filter(Boolean).join(' · ')

  function categories(page) {
    const rows = cats.map((c) => ({
      id: `cat:${c.id}`,
      title: c.title,
      description: T.catDesc(c.items.length, $(Math.min(...c.items.map(priceMin)))),
    }))
    return [W.list(T.menuIntro, T.btn.sections, [{ title: T.sectionsTitle, rows: paginate(rows, page, 'menu') }], { footer: T.menuFooter })]
  }

  function categoryItems(cat, page) {
    const rows = cat.items.map((it) => ({ id: `item:${it.id}`, title: it.name, description: itemDesc(it) }))
    return [W.list(T.catIntro(cat.title), T.btn.dishes, [{ title: cat.title, rows: paginate(rows, page, `cat:${cat.id}`) }], { footer: T.menuFooter })]
  }

  function itemCard(s, it) {
    const lines = [`*${it.name}*`]
    if (it.desc) lines.push(it.desc)
    lines.push('')
    if (it.variants) for (const v of it.variants) lines.push(`• ${v.name} — ${$(v.price)}`)
    else lines.push(`💰 ${$(it.price)}`)
    const image = it.photo && mediaBase ? `${mediaBase}/${encodeURIComponent(it.photo)}` : null

    if (it.variants?.length > 3) {
      const rows = it.variants.map((v, i) => ({ id: `add:${it.id}:${i}`, title: v.name, description: $(v.price) }))
      return [W.list(lines.join('\n') + '\n\n' + T.chooseVariant, T.btn.choose, [{ title: it.name, rows }])]
    }
    let btns
    if (it.variants) {
      lines.push('', T.chooseVariant)
      btns = it.variants.map((v, i) => {
        const full = `${v.name} · ${$(v.price)}`
        return { id: `add:${it.id}:${i}`, title: full.length <= 20 ? full : v.name }
      })
      if (btns.length < 3) btns.push({ id: `cat:${it.cat}`, title: T.btn.back })
    } else {
      const n = cartLines(s).length
      btns = [
        { id: `add:${it.id}`, title: T.btn.toCart },
        { id: `cat:${it.cat}`, title: T.btn.back },
        n ? { id: 'cart', title: T.btn.cartN(n) } : { id: 'home', title: T.btn.home },
      ]
    }
    return [W.buttons(lines.join('\n'), btns, { image })]
  }

  // ───────── cart ─────────

  const variantOf = (it, v) => (it.variants ? it.variants[v ?? 0] : null)
  function lineLabel(it, v) {
    const vr = variantOf(it, v)
    if (!vr) return it.name
    return norm(it.name).includes(norm(vr.name)) ? vr.name : `${it.name} (${vr.name})`
  }
  // drops dishes that disappeared from the menu, keeps s.cart and the result aligned
  function cartLines(s) {
    s.cart = (s.cart || []).filter((l) => {
      const it = items.get(l.id)
      return it && (!it.variants || variantOf(it, l.v))
    })
    return s.cart.map((l) => {
      const it = items.get(l.id)
      const price = it.variants ? variantOf(it, l.v).price : it.price
      return { name: lineLabel(it, l.v), qty: l.qty, price, sum: price * l.qty }
    })
  }
  const totalOf = (lines) => lines.reduce((a, l) => a + l.sum, 0)
  function linesText(lines, max = 600) {
    let out = ''
    let k = 0
    for (const [i, l] of lines.entries()) {
      const row = `${i + 1}. ${l.name} — ${l.qty > 1 ? `${l.qty} × ${$(l.price)} = ` : ''}${$(l.sum)}`
      if (out.length + row.length + 1 > max) break
      out += (out ? '\n' : '') + row
      k++
    }
    if (k < lines.length) out += '\n' + T.andMore(lines.length - k)
    return out
  }

  function askQty(s, itemId, v) {
    const it = items.get(itemId)
    if (!it || (it.variants && !variantOf(it, v))) return expired(s)
    s.draft.pending = { id: itemId, v: it.variants ? v : null }
    s.step = 'qty'
    return [W.buttons(T.askQty(lineLabel(it, v)), [1, 2, 3].map((n) => ({ id: `qty:${n}`, title: String(n) })), { footer: T.qtyFooter })]
  }

  function addToCart(s, n) {
    const p = s.draft.pending
    if (!p || !items.get(p.id)) return expired(s)
    if (!(n >= 1 && n <= MAX_QTY)) return [W.text(T.badQty(MAX_QTY))]
    const line = s.cart.find((l) => l.id === p.id && (l.v ?? null) === (p.v ?? null))
    if (line) line.qty = Math.min(MAX_QTY, line.qty + n)
    else s.cart.push({ id: p.id, v: p.v ?? null, qty: n })
    s.draft.pending = null
    s.step = 'idle'
    const lines = cartLines(s)
    return [
      W.buttons(T.added(lineLabel(items.get(p.id), p.v), n, lines.length, $(totalOf(lines))), [
        { id: 'menu', title: T.btn.more },
        { id: 'cart', title: T.btn.cart },
        { id: 'checkout', title: T.btn.checkout },
      ]),
    ]
  }

  function cart(s, note = '') {
    const lines = cartLines(s)
    if (!lines.length) return [W.buttons((note ? note + '\n\n' : '') + T.cartEmpty, [{ id: 'menu', title: T.btn.menu }, { id: 'home', title: T.btn.home }])]
    return [
      W.buttons((note ? note + '\n\n' : '') + T.cart(linesText(lines), $(totalOf(lines))), [
        { id: 'checkout', title: T.btn.checkout },
        { id: 'cart:edit', title: T.btn.edit },
        { id: 'menu', title: T.btn.more },
      ]),
    ]
  }

  function cartEdit(s) {
    const lines = cartLines(s)
    if (!lines.length) return cart(s)
    const rows = lines.slice(0, 9).map((l, i) => ({ id: `cart:rm:${i}`, title: l.name, description: T.rmDesc(l.qty, $(l.sum)) }))
    rows.push({ id: 'cart:clear', title: T.clearCart, description: T.clearCartDesc })
    return [W.list(T.editIntro, T.btn.choose, [{ title: T.cartTitle, rows }])]
  }

  function cartRemove(s, i) {
    const lines = cartLines(s)
    const l = s.cart[i]
    if (!l) return cart(s)
    const name = lines[i].name
    if (l.qty > 1) l.qty -= 1
    else s.cart.splice(i, 1)
    return cart(s, T.removed(name))
  }

  // ───────── checkout ─────────

  function startCheckout(s) {
    if (!cartLines(s).length) return cart(s)
    if (!orderCfg.enabled) return [W.text(T.ordersOff(phones.join(', ')))]
    s.draft.order = {}
    return orderNext(s.wa, s)
  }

  // asks the first missing detail; when nothing is missing shows the summary
  function orderNext(from, s) {
    const d = s.draft.order
    if (!d) return expired(s)
    const lines = cartLines(s)
    if (!lines.length) return cart(s)
    if (!d.ship) {
      if (orderCfg.delivery && orderCfg.pickup) return askShip(s)
      d.ship = orderCfg.delivery ? 'delivery' : 'pickup'
    }
    if (d.ship === 'delivery') {
      const min = orderCfg.minDelivery
      const total = totalOf(lines)
      if (min && total < min) {
        d.ship = null
        s.step = 'idle'
        return [
          W.buttons(T.minDelivery($(min), $(min - total)), [
            { id: 'menu', title: T.btn.more },
            orderCfg.pickup ? { id: 'ship:pickup', title: T.btn.pickup } : null,
            { id: 'cart', title: T.btn.cart },
          ]),
        ]
      }
      if (!d.address) return askAddress(s)
    } else {
      if (!d.branch) {
        if (branches.length > 1) return askBranch(s, 'ob')
        d.branch = branches[0]?.id || null
      }
      if (!d.when) return askPickupTime(s)
    }
    if (!d.pay) {
      if (orderCfg.payments.length > 1) return askPay(s)
      d.pay = orderCfg.payments[0] || null
    }
    if (!nameOf(s)) return askName(s, 'order')
    return orderSummary(from, s)
  }

  function askShip(s) {
    s.step = 'ship'
    return [
      W.buttons(T.askShip(orderCfg.deliveryNote), [
        { id: 'ship:delivery', title: T.btn.delivery },
        { id: 'ship:pickup', title: T.btn.pickup },
      ]),
    ]
  }
  function askAddress(s) {
    s.step = 'addr'
    return [W.askLocation(T.askAddress)]
  }
  function askBranch(s, prefix) {
    s.step = 'branch'
    s.draft.branchFor = prefix
    const body = prefix === 'ob' ? T.askBranchPickup : T.askBranchBook
    if (branches.length <= 3) {
      return [W.buttons(`${body}\n\n${branches.map(T.branchLine).join('\n')}`, branches.map((b) => ({ id: `${prefix}:${b.id}`, title: b.title })))]
    }
    const rows = branches.map((b) => ({ id: `${prefix}:${b.id}`, title: b.title, description: T.branchDesc(b) }))
    return [W.list(body, T.btn.choose, [{ title: T.branchesTitle, rows }])]
  }
  function askPickupTime(s) {
    s.step = 'pickup_time'
    return [
      W.buttons(T.askPickupTime + closedNote(branchById(s.draft.order.branch)), [
        { id: 'when:asap', title: T.btn.asap },
        { id: 'when:30', title: T.btn.in30 },
        { id: 'when:60', title: T.btn.in60 },
      ], { footer: T.timeFooter }),
    ]
  }
  function askPay(s) {
    s.step = 'pay'
    const p = orderCfg.payments
    if (p.length <= 3) return [W.buttons(T.askPay, p.map((x, i) => ({ id: `pay:${i}`, title: x })))]
    return [W.list(T.askPay, T.btn.choose, [{ title: T.payTitle, rows: p.map((x, i) => ({ id: `pay:${i}`, title: x })) }])]
  }
  function askName(s, after) {
    s.step = 'name'
    s.draft.after = after
    return [W.text(T.askName)]
  }

  // "\n\n⚠️ Closed now, we open at 09:00" or ''
  function closedNote(b) {
    const list = b ? [b] : branches
    const n = now().minutes
    if (!list.length || list.some((x) => isOpenAt(x, n))) return ''
    return '\n\n' + T.closedNow(list.map((x) => x.open).sort()[0])
  }

  function orderSummary(from, s) {
    s.step = 'confirm'
    const d = s.draft.order
    d.ready = true
    const lines = cartLines(s)
    const b = branchById(d.branch)
    const body = T.orderSummary({
      items: linesText(lines, 550),
      total: $(totalOf(lines)),
      ship: d.ship,
      address: d.address,
      branch: b,
      when: d.when,
      pay: d.pay,
      comment: d.comment,
      name: nameOf(s),
      phone: phoneFmt(from),
      deliveryNote: d.ship === 'delivery' ? orderCfg.deliveryNote : null,
    }) + closedNote(d.ship === 'pickup' ? b : null)
    return [
      W.buttons(body, [
        { id: 'order:ok', title: T.btn.confirm },
        { id: 'order:note', title: T.btn.comment },
        { id: 'order:cancel', title: T.btn.cancel },
      ]),
    ]
  }

  async function confirmOrder(from, s) {
    const d = s.draft.order
    const lines = cartLines(s)
    if (!d?.ready || !lines.length) return expired(s)
    const order = {
      id: store.nextId('order'),
      at: Date.now(),
      waId: from,
      name: nameOf(s),
      phone: phoneFmt(from),
      lines,
      total: totalOf(lines),
      ship: d.ship,
      address: d.address || null,
      loc: d.loc || null,
      branch: d.branch || null,
      when: d.when || null,
      pay: d.pay || null,
      comment: d.comment || null,
      status: 'new',
    }
    store.add('orders', order)
    s.cart = []
    reset(s)
    await toOwners(ownerOrderMsg(order), { customer: from, summary: T.owner.orderShort(order.id, $(order.total), order.name) })
    return [W.text(T.orderSent(order.id))]
  }

  function ownerOrderMsg(o) {
    return W.buttons(
      T.owner.newOrder({
        ...o,
        items: linesText(o.lines, 550),
        total: $(o.total),
        branch: branchById(o.branch),
        map: o.loc ? mapsLink(o.loc) : null,
      }),
      [
        { id: `ord:ok:${o.id}`, title: T.btn.accept },
        { id: `ord:no:${o.id}`, title: T.btn.reject },
      ],
      { footer: T.owner.replyHint },
    )
  }

  // ───────── table booking ─────────

  function startBooking(from, s) {
    if (!bookCfg.enabled) return [W.text(T.bookingOff(phones.join(', ')))]
    reset(s)
    s.draft.book = {}
    return bookNext(from, s)
  }

  function bookNext(from, s) {
    const d = s.draft.book
    if (!d) return expired(s)
    if (!d.branch) {
      if (branches.length > 1) return askBranch(s, 'bb')
      d.branch = branches[0]?.id || null
    }
    if (!d.date) return askDate(s)
    if (d.time == null) return askTime(s)
    if (!d.guests) return askGuests(s)
    if (d.seat === undefined) {
      if (bookCfg.seats.length) return askSeat(s)
      d.seat = null
    }
    if (!nameOf(s)) return askName(s, 'book')
    return bookSummary(from, s)
  }

  const bookBranch = (s) => branchById(s.draft.book?.branch) || branches[0] || { open: '00:00', close: '00:00' }
  // for normal hours (not past midnight): too late once we are 30 min before the last booking slot
  const tooLateToday = (b) => {
    const last = lastBooking(b)
    return last >= hm(b.open) && now().minutes > last - 30
  }

  function askDate(s) {
    s.step = 'book_date'
    const start = tooLateToday(bookBranch(s)) ? 1 : 0
    const today = now().date
    const btns = [start, start + 1, start + 2].map((n) => ({ id: `bd:${n}`, title: T.dayBtn(n, addDays(today, n)) }))
    return [W.buttons(T.askDate, btns, { footer: T.dateFooter })]
  }

  function setDate(from, s, date) {
    const d = s.draft.book
    if (!d) return expired(s)
    const today = now().date
    const ahead = daysBetween(today, date)
    if (ahead < 0) return [W.text(T.pastDate)]
    if (ahead > BOOK_DAYS_AHEAD) return [W.text(T.tooFar(BOOK_DAYS_AHEAD))]
    if (ahead === 0 && tooLateToday(bookBranch(s))) return [W.text(T.todayTooLate), ...askDate(s)]
    d.date = date
    d.time = null
    return bookNext(from, s)
  }

  function askTime(s) {
    s.step = 'book_time'
    const b = bookBranch(s)
    const d = s.draft.book
    const isToday = d.date === now().date
    const nowMin = now().minutes
    const options = [13 * 60, 18 * 60, 19 * 60, 20 * 60]
      .filter((m) => canBookAt(b, m) && (!isToday || m >= nowMin + 30))
      .slice(-3)
    const body = T.askTime(b.open, fmtHM(lastBooking(b)))
    if (!options.length) return [W.text(body)]
    return [W.buttons(body, options.map((m) => ({ id: `bt:${m}`, title: fmtHM(m) })), { footer: T.timeFooter })]
  }

  function setTime(from, s, m) {
    const d = s.draft.book
    if (!d?.date) return expired(s)
    const b = bookBranch(s)
    if (m == null || Number.isNaN(m)) return [W.text(T.badTime)]
    if (!canBookAt(b, m)) return [W.text(T.outsideHours(b.open, fmtHM(lastBooking(b))))]
    if (d.date === now().date && m < now().minutes + 15) return [W.text(T.timePassed)]
    d.time = m
    return bookNext(from, s)
  }

  function askGuests(s) {
    s.step = 'book_guests'
    return [W.buttons(T.askGuests, [2, 4, 6].map((n) => ({ id: `bg:${n}`, title: T.guests(n) })), { footer: T.guestsFooter })]
  }

  function setGuests(from, s, n) {
    const d = s.draft.book
    if (!d?.date) return expired(s)
    if (!(n >= 1)) return [W.text(T.badGuests)]
    if (n > bookCfg.maxGuests) return [W.text(T.bigGroup(bookCfg.maxGuests, phones.join(', ')))]
    d.guests = n
    return bookNext(from, s)
  }

  function askSeat(s) {
    s.step = 'book_seat'
    const rows = bookCfg.seats.slice(0, 9).map((x, i) => ({ id: `bs:${i}`, title: x }))
    rows.push({ id: 'bs:any', title: T.anySeat })
    return [W.list(T.askSeat, T.btn.choose, [{ title: T.seatsTitle, rows }], { footer: T.seatFooter })]
  }

  function bookSummary(from, s) {
    s.step = 'book_confirm'
    const d = s.draft.book
    d.ready = true
    return [
      W.buttons(
        T.bookSummary({
          branch: branchById(d.branch),
          date: T.dateFmt(d.date),
          time: fmtHM(d.time),
          guests: d.guests,
          seat: d.seat,
          comment: d.comment,
          name: nameOf(s),
          phone: phoneFmt(from),
        }),
        [
          { id: 'book:ok', title: T.btn.bookOk },
          { id: 'book:note', title: T.btn.wish },
          { id: 'book:cancel', title: T.btn.cancel },
        ],
      ),
    ]
  }

  async function confirmBooking(from, s) {
    const d = s.draft.book
    if (!d?.ready) return expired(s)
    const r = {
      id: store.nextId('booking'),
      at: Date.now(),
      waId: from,
      name: nameOf(s),
      phone: phoneFmt(from),
      branch: d.branch,
      date: d.date,
      time: d.time,
      guests: d.guests,
      seat: d.seat ?? null,
      comment: d.comment || null,
      status: 'new',
    }
    store.add('bookings', r)
    reset(s)
    await toOwners(
      W.buttons(
        T.owner.newBooking({ ...r, branch: branchById(r.branch), dateText: T.dateFmt(r.date), timeText: fmtHM(r.time) }),
        [
          { id: `bk:ok:${r.id}`, title: T.btn.approve },
          { id: `bk:no:${r.id}`, title: T.btn.noSeats },
        ],
        { footer: T.owner.replyHint },
      ),
      { customer: from, summary: T.owner.bookShort(r.id, T.dateFmt(r.date), fmtHM(r.time), r.guests, r.name) },
    )
    return [W.text(T.bookSent(r.id))]
  }

  // ───────── addresses, admin hand-off ─────────

  function info() {
    const n = now().minutes
    const out = []
    for (const b of branches) {
      if (b.lat != null && b.lon != null) out.push(W.location(b.lat, b.lon, `${cafe.name} — ${b.title}`, b.address || b.title))
      const body = T.branchInfo(b, isOpenAt(b, n))
      out.push(b.map ? W.cta(body, T.btn.openMap, b.map) : W.text(body))
    }
    out.push(W.buttons(T.whatNext, quickNav()))
    return out
  }

  async function startHandoff(from, s) {
    reset(s)
    if (!owners.length) return [W.text(T.callUs(phones.join(', ')))]
    s.handoff = { until: Date.now() + HANDOFF_MS }
    await toOwners(
      W.buttons(T.owner.wantsHuman(nameOf(s), phoneFmt(from)), [{ id: `chat:end:${from}`, title: T.btn.returnBot }], { footer: T.owner.replyHint }),
      { customer: from, summary: T.owner.humanShort(nameOf(s)) },
    )
    return [W.text(T.handoffStarted(phones.join(', ')))]
  }

  async function forwardToOwners(from, s, input) {
    const who = `${nameOf(s) || T.owner.noName} (${phoneFmt(from)})`
    let body
    if (input.kind === 'text') body = T.owner.fwdText(who, input.text)
    else if (input.kind === 'location') body = T.owner.fwdText(who, `📍 ${mapsLink(input.loc)}`)
    else if (input.kind === 'action') body = T.owner.fwdText(who, input.text)
    else body = T.owner.fwdMedia(who, input.type)
    await toOwners(W.text(body), { customer: from, summary: T.owner.msgShort(nameOf(s)) })
  }

  // ───────────────────────── cafe staff ─────────────────────────

  async function ownerFlow(from, input, os) {
    if (input.kind === 'action') return ownerAction(from, input.id)
    const rec = input.ctx ? store.recall(input.ctx) : null
    if (rec?.customer) return relay(from, rec.customer, input)
    if (input.kind === 'text') {
      const t = norm(input.text)
      if (T.words.ownerOrders.includes(t)) return send(from, W.text(ordersReport()))
      if (T.words.ownerBookings.includes(t)) return send(from, W.text(bookingsReport()))
      if (T.words.asCustomer.includes(t)) {
        os.asCustomer = true
        store.save()
        return send(from, W.text(T.owner.asCustomer))
      }
    }
    if (input.ctx) return send(from, W.text(T.owner.cantRelay))
    return send(from, W.text(T.owner.help(cafe.name)))
  }

  // the admin replied (swipe → reply) to a message about a customer: pass the text on
  async function relay(owner, customer, input) {
    if (input.kind !== 'text') return send(owner, W.text(T.owner.onlyTextRelay))
    const cs = store.session(customer)
    const fresh = !cs.handoff
    cs.handoff = { until: Date.now() + HANDOFF_MS }
    store.save()
    const id = await send(customer, W.text(T.fromAdmin(input.text, fresh)))
    if (!id) return send(owner, W.text(T.owner.relayFailed(false, phoneFmt(customer))))
    store.remember(id, { to: customer, relayOwner: owner })
    if (input.mid) await send(owner, W.reaction(input.mid, '✅'))
  }

  async function ownerAction(owner, id) {
    const [kind, act, ref] = id.split(':')
    if (kind === 'ord') return orderAction(owner, act, +ref)
    if (kind === 'bk') return bookingAction(owner, act, +ref)
    if (kind === 'chat' && act === 'end' && ref) {
      const cs = store.session(ref)
      const was = !!cs.handoff
      cs.handoff = null
      store.save()
      if (was) await send(ref, W.buttons(T.botBack, quickNav()))
      return send(owner, W.text(T.owner.chatEnded(was)))
    }
    // unknown button (e.g. the template's "show" button) — the pending queue was already flushed
  }

  async function orderAction(owner, act, id) {
    const o = store.find('orders', id)
    if (!o) return send(owner, W.text(T.owner.notFound(id)))
    const b = branchById(o.branch)
    const already = () => send(owner, W.text(T.owner.already(T.owner.orderNo(o.id), T.status[o.status])))
    if (act === 'ok') {
      if (o.status !== 'new') return already()
      o.status = 'accepted'
      store.save()
      await send(o.waId, W.text(T.orderAccepted(o, b)))
      return sendOwner(
        owner,
        W.buttons(T.owner.accepted(o.id), [{ id: `ord:ready:${o.id}`, title: o.ship === 'delivery' ? T.btn.sentOut : T.btn.ready }]),
        { customer: o.waId },
      )
    }
    if (act === 'no') {
      if (o.status !== 'new') return already()
      o.status = 'rejected'
      store.save()
      await send(o.waId, W.text(T.orderRejected(o.id, phones.join(', '))))
      return send(owner, W.text(T.owner.rejected(o.id)))
    }
    if (act === 'ready') {
      if (o.status !== 'accepted') return already()
      o.status = o.ship === 'delivery' ? 'sent' : 'ready'
      store.save()
      await send(o.waId, W.text(o.ship === 'delivery' ? T.orderOnTheWay(o.id) : T.orderReady(o.id, b)))
      return send(owner, W.text(T.owner.done(o.id)))
    }
  }

  async function bookingAction(owner, act, id) {
    const r = store.find('bookings', id)
    if (!r) return send(owner, W.text(T.owner.notFound(id)))
    if (r.status !== 'new') return send(owner, W.text(T.owner.already(T.owner.bookingNo(r.id), T.status[r.status])))
    const b = branchById(r.branch)
    if (act === 'ok') {
      r.status = 'confirmed'
      store.save()
      await send(r.waId, W.text(T.bookConfirmed(r.id, b, T.dateFmt(r.date), fmtHM(r.time), r.guests)))
      return send(owner, W.text(T.owner.bookOk(r.id)))
    }
    if (act === 'no') {
      r.status = 'rejected'
      store.save()
      await send(r.waId, W.buttons(T.bookRejected(r.id), [{ id: 'book', title: T.btn.otherTime }, { id: 'human', title: T.btn.human }]))
      return send(owner, W.text(T.owner.bookNo(r.id)))
    }
  }

  function ordersReport() {
    const today = now().date
    const list = store.list('orders').filter((o) => localNow(tz, new Date(o.at)).date === today)
    if (!list.length) return T.owner.noOrdersToday
    const rows = list.slice(-15).map((o) =>
      T.owner.orderRow(o, fmtHM(localNow(tz, new Date(o.at)).minutes), $(o.total), T.status[o.status]))
    return T.owner.ordersToday(rows, list.length, $(list.filter((o) => o.status !== 'rejected').reduce((a, o) => a + o.total, 0)))
  }

  function bookingsReport() {
    const today = now().date
    const list = store
      .list('bookings')
      .filter((r) => r.date >= today && r.status !== 'rejected')
      .sort((a, b) => (a.date + fmtHM(a.time)).localeCompare(b.date + fmtHM(b.time)))
    if (!list.length) return T.owner.noBookings
    return T.owner.bookingsList(list.slice(0, 20).map((r) =>
      T.owner.bookingRow(r, T.dateFmt(r.date), fmtHM(r.time), branchById(r.branch), T.status[r.status])))
  }

  return { handleIncoming, handleStatus }
}
