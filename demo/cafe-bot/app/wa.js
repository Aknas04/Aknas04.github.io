// Builders for WhatsApp Cloud API message objects.
// Every builder trims text to Meta's limits, so a long dish name never breaks a send.
import { cut } from './util.js'

export const text = (body) => ({
  type: 'text',
  text: { body: cut(body, 4096), preview_url: /https?:\/\//.test(String(body)) },
})

const headerFooter = (it, { image, header, footer } = {}) => {
  if (image) it.header = { type: 'image', image: { link: image } }
  else if (header) it.header = { type: 'text', text: cut(header, 60) }
  if (footer) it.footer = { text: cut(footer, 60) }
  return it
}

// Up to 3 reply buttons, title ≤ 20 chars
export function buttons(body, btns, opts = {}) {
  const it = {
    type: 'button',
    body: { text: cut(body, 1024) },
    action: {
      buttons: btns.filter(Boolean).slice(0, 3).map((b) => ({
        type: 'reply',
        reply: { id: cut(b.id, 256), title: cut(b.title, 20) },
      })),
    },
  }
  return { type: 'interactive', interactive: headerFooter(it, opts) }
}

// List: button ≤ 20, sections ≤ 10, rows ≤ 10 in total, row title ≤ 24, description ≤ 72
export function list(body, button, sections, opts = {}) {
  let left = 10
  const secs = sections
    .map((s) => {
      const rows = s.rows.filter(Boolean).slice(0, Math.max(left, 0))
      left -= rows.length
      return {
        title: cut(s.title, 24),
        rows: rows.map((r) => ({
          id: cut(r.id, 200),
          title: cut(r.title, 24),
          ...(r.description ? { description: cut(r.description, 72) } : {}),
        })),
      }
    })
    .filter((s) => s.rows.length)
  const it = { type: 'list', body: { text: cut(body, 4096) }, action: { button: cut(button, 20), sections: secs } }
  return { type: 'interactive', interactive: headerFooter(it, { header: opts.header, footer: opts.footer }) }
}

// Message with a link button (2GIS, Instagram, site)
export const cta = (body, label, url, opts = {}) => ({
  type: 'interactive',
  interactive: headerFooter(
    {
      type: 'cta_url',
      body: { text: cut(body, 1024) },
      action: { name: 'cta_url', parameters: { display_text: cut(label, 20), url } },
    },
    opts,
  ),
})

// Message with a "Send location" button
export const askLocation = (body) => ({
  type: 'interactive',
  interactive: { type: 'location_request_message', body: { text: cut(body, 1024) }, action: { name: 'send_location' } },
})

export const image = (link, caption) => ({
  type: 'image',
  image: { link, ...(caption ? { caption: cut(caption, 1024) } : {}) },
})

export const location = (latitude, longitude, name, address) => ({
  type: 'location',
  location: { latitude, longitude, ...(name ? { name } : {}), ...(address ? { address } : {}) },
})

export const reaction = (messageId, emoji) => ({ type: 'reaction', reaction: { message_id: messageId, emoji } })

// Approved message template (needed to write to someone outside the 24-hour window)
export const template = (name, lang, params = []) => ({
  type: 'template',
  template: {
    name,
    language: { code: lang },
    ...(params.length
      ? { components: [{ type: 'body', parameters: params.map((p) => ({ type: 'text', text: cut(String(p).replace(/\s+/g, ' '), 200) })) }] }
      : {}),
  },
})

// Checks a built message against Cloud API rules. Used by tests and logged in dev.
export function problems(msg) {
  const out = []
  const json = JSON.stringify(msg)
  if (/undefined|NaN|\[object /.test(json)) out.push('в сообщении есть undefined/NaN')
  if (msg.type === 'text' && !msg.text.body) out.push('пустой текст')
  if (msg.type !== 'interactive') return out
  const it = msg.interactive
  if (it.body && !it.body.text) out.push('пустой body')
  if (it.type === 'button') {
    const b = it.action.buttons
    if (b.length < 1 || b.length > 3) out.push(`кнопок ${b.length}`)
    if (new Set(b.map((x) => x.reply.id)).size !== b.length) out.push('одинаковые id кнопок')
    if (new Set(b.map((x) => x.reply.title)).size !== b.length) out.push('одинаковые названия кнопок')
    for (const x of b) if (!x.reply.title || x.reply.title.length > 20) out.push(`кнопка «${x.reply.title}»`)
  }
  if (it.type === 'list') {
    const rows = it.action.sections.flatMap((s) => s.rows)
    if (rows.length < 1 || rows.length > 10) out.push(`строк в списке ${rows.length}`)
    if (new Set(rows.map((r) => r.id)).size !== rows.length) out.push('одинаковые id строк')
    if (it.action.sections.length > 1 && it.action.sections.some((s) => !s.title)) out.push('секция без названия')
    for (const r of rows) {
      if (!r.title || r.title.length > 24) out.push(`строка «${r.title}»`)
      if (r.description && r.description.length > 72) out.push(`описание «${r.description}»`)
    }
  }
  return out
}
