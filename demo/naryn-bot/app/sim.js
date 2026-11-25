// Simulator engine: the real bot with a fake WhatsApp that writes into an event log.
// Used by the server (/sim) and directly in the browser (static demo page).
import { createBot } from './bot.js'
import { createStore } from './store.js'
import { textsFor } from './texts/index.js'
import { phoneFmt } from './util.js'

export function createSim(client, { mediaBase = '/media', log = console } = {}) {
  const T = textsFor(client.cafe.lang)
  const ids = { customer: T.sim.guest.phone, owner: T.sim.owner.phone }
  const names = { [ids.customer]: T.sim.guest.name, [ids.owner]: T.sim.owner.name }
  let events = []
  let seq = 0
  let out = 0
  let inn = 0
  let epoch = Date.now()
  const store = createStore()
  const bot = createBot({
    client,
    store,
    owners: [ids.owner],
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
      ids,
      guest: { name: T.sim.guest.name, phone: phoneFmt(ids.customer) },
      owner: { name: T.sim.owner.name, phone: phoneFmt(ids.owner) },
      hints: client.cafe.demo?.hints || T.sim.hints,
      ui: T.sim.ui,
      epoch,
    }),
    log: (after = 0) => ({ epoch, events: events.filter((e) => e.seq > after) }),
    // body: { as: customer|owner, type: text|interactive|location, text, reply:{kind,id,title}, location, context }
    async send({ as, type, text, reply, location, context } = {}) {
      const from = ids[as]
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
      await bot.handleIncoming({ from, name: names[from], message: m })
    },
    reset() {
      store.reset()
      events = []
      epoch = Date.now()
    },
  }
}
