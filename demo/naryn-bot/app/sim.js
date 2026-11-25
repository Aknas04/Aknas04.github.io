// Simulator engine: the real bot with a fake WhatsApp that writes into an event log.
// Used by the server (/sim) and directly in the browser (static demo page).
import { createBot } from './bot.js'
import { createStore } from './store.js'

export const SIM = { customer: '77010000001', owner: '77010000000' }
const NAMES = { [SIM.customer]: 'Айгерим', [SIM.owner]: 'Администратор' }
const DEFAULT_HINTS = ['Привет', 'Меню', 'Хочу забронировать столик']

export function createSim(client, { mediaBase = '/media', log = console } = {}) {
  let events = []
  let seq = 0
  let out = 0
  let inn = 0
  let epoch = Date.now()
  const store = createStore()
  const bot = createBot({
    client,
    store,
    owners: [SIM.owner],
    mediaBase,
    log,
    transport: {
      name: 'sim',
      async send(to, msg) {
        const id = `wamid.OUT${++out}`
        events.push({ seq: ++seq, ts: Date.now(), dir: 'out', to, id, msg })
        return id
      },
    },
  })

  return {
    store,
    state: () => ({
      cafe: { name: client.cafe.name, tagline: client.cafe.tagline || '' },
      ids: SIM,
      hints: client.cafe.demo?.hints || DEFAULT_HINTS,
      epoch,
    }),
    log: (after = 0) => ({ epoch, events: events.filter((e) => e.seq > after) }),
    // body: { as: customer|owner, type: text|interactive|location, text, reply:{kind,id,title}, location, context }
    async send({ as, type, text, reply, location, context } = {}) {
      const from = SIM[as]
      if (!from) throw new Error('as = customer | owner')
      const m = { from, id: `wamid.IN${++inn}`, timestamp: String(Math.floor(Date.now() / 1000)), type }
      if (type === 'text') m.text = { body: String(text || '').slice(0, 4096) }
      else if (type === 'interactive') {
        const r = { id: String(reply?.id || ''), title: String(reply?.title || '') }
        m.interactive = reply?.kind === 'list' ? { type: 'list_reply', list_reply: r } : { type: 'button_reply', button_reply: r }
      } else if (type === 'location') m.location = location
      else throw new Error('type = text | interactive | location')
      if (context) m.context = { id: String(context) }
      events.push({ seq: ++seq, ts: Date.now(), dir: 'in', from, id: m.id, msg: m })
      await bot.handleIncoming({ from, name: NAMES[from], message: m })
    },
    reset() {
      store.reset()
      events = []
      epoch = Date.now()
    },
  }
}
