// Tiny in-memory database: chat sessions, orders, bookings and sent-message notes.
// No Node imports, so the same file runs in the browser demo.
// onChange(db) is called (debounced by the caller) whenever data changes — filestore.js uses it to write JSON.

const blank = () => ({ seq: { order: 0, booking: 0 }, sessions: {}, orders: [], bookings: [], memo: {}, pending: {} })
const MEMO_MAX = 1500

export function createStore({ data = null, onChange = null } = {}) {
  let db = { ...blank(), ...(data || {}) }
  const seen = new Set()
  const save = () => onChange?.(db)

  return {
    save,
    flush() {},
    dump: () => db,
    session(id) {
      return (db.sessions[id] ??= { step: 'idle', cart: [], draft: {} })
    },
    // WhatsApp may deliver the same webhook twice
    seen(id) {
      if (seen.has(id)) return true
      seen.add(id)
      if (seen.size > 5000) seen.delete(seen.values().next().value)
      return false
    },
    nextId(kind) {
      db.seq[kind] = (db.seq[kind] || 0) + 1
      save()
      return db.seq[kind]
    },
    add(coll, rec) {
      db[coll].push(rec)
      if (db[coll].length > 5000) db[coll].shift()
      save()
      return rec
    },
    find: (coll, id) => db[coll].find((r) => r.id === id),
    list: (coll) => db[coll],
    // what we know about a message we sent (who it was about), keyed by its wamid
    remember(msgId, rec) {
      db.memo[msgId] = { ...rec, t: Date.now() }
      const keys = Object.keys(db.memo)
      if (keys.length > MEMO_MAX) for (const k of keys.slice(0, keys.length - MEMO_MAX)) delete db.memo[k]
      save()
    },
    recall: (msgId) => db.memo[msgId],
    // owner notifications that could not be delivered yet (24-hour window closed)
    pending: (owner) => (db.pending[owner] ??= []),
    reset() {
      db = blank()
      seen.clear()
      save()
    },
  }
}
