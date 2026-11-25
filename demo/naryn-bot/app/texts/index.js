// Languages of the bot. To add one: copy ru.js, translate, register it here, set "lang" in cafe.json.
import ru from './ru.js'
import tr from './tr.js'

export const LANGS = { ru, tr }
export const textsFor = (lang) => LANGS[lang] || ru
