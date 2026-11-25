// Indexes one client (cafe): settings + menu. No Node imports — also used by the browser demo.
// Reading the files from disk is in load.js.

export function buildClient(cafe, cats) {
  const items = new Map()
  const catById = new Map()
  for (const c of cats) {
    if (String(c.id).includes(':')) throw new Error(`В id раздела нельзя ставить двоеточие: ${c.id}`)
    catById.set(c.id, c)
    c.items.forEach((it, i) => {
      it.id ||= `${c.id}-${i + 1}`
      it.cat = c.id
      if (String(it.id).includes(':')) throw new Error(`В id блюда нельзя ставить двоеточие: ${it.id}`)
      if (items.has(it.id)) throw new Error(`Повторяется id блюда: ${it.id}`)
      if (it.price == null && !it.variants?.length) throw new Error(`У блюда нет цены: ${it.name}`)
      items.set(it.id, it)
    })
  }
  return { cafe, cats, items, catById }
}
