// Собирает светлую версию сайта Naryn из тёмной (../naryn/index.html).
// Запуск из этой папки: node build.mjs
// Палитра из логотипа: кремовый фон, коричневый текст, оранжевые кнопки.
// Фото, шрифты и логотипы берутся из ../naryn/, здесь только index.html.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
let s = fs.readFileSync(path.join(here, "../naryn/index.html"), "utf8");

// замена, которая обязана сработать (expect = сколько раз, или "any" для 1 и больше)
function rep(from, to, expect = 1) {
  const n = s.split(from).length - 1;
  if (expect === "any" ? n < 1 : n !== expect) throw new Error(`«${from}»: найдено ${n}, ожидалось ${expect}`);
  s = s.split(from).join(to);
}

// файлы из тёмной версии
s = s.replace(/(["(])(photos|dishes|fonts|logo)\//g, "$1../naryn/$2/");
rep("../naryn/logo/wordmark.webp", "../naryn/logo/wordmark-brown.webp");
rep("../naryn/logo/naryn-light.webp", "../naryn/logo/naryn-color.webp");

// заголовки, превью, ссылка на другую версию
rep("<title>Naryn, семейное халал-кафе в Алматы (демо)</title>", "<title>Naryn, семейное халал-кафе в Алматы (демо, светлая версия)</title>");
rep('content="https://aknas04.github.io/demo/naryn/"', 'content="https://aknas04.github.io/demo/naryn-light/"');
rep('<meta name="theme-color" content="#12100e" />', '<meta name="theme-color" content="#fbf6ec" />');
rep("color-scheme: dark;", "color-scheme: light;");
rep('Есть <a href="../naryn-light/">светлая версия</a>.', 'Есть <a href="../naryn/">тёмная версия</a>.');

// палитра
rep("--bg: #12100e;", "--bg: #fbf6ec;");
rep("--surface: #1c1916;", "--surface: #f4ebda;");
rep("--surface-2: #26221d;", "--surface-2: #eadcc3;");
rep("--ink: #ebebe9;", "--ink: #3a1c10;");
rep("--muted: #b3a999;", "--muted: #75574a;");
rep("--gold: #c9a46a;", "--gold: #e78a23;");
rep("--gold-hi: #dbb983;", "--gold-hi: #f09c42;");
rep("--gold-ink: #15120f;", "--gold-ink: #3a1c10;\n        --gold-text: #964a0a;\n        --green-text: #3e6b21;");

// оранжевый из логотипа годится для заливки, но не для текста на креме: текст и фокус темнее
rep("color: var(--gold)", "color: var(--gold-text)", "any");
rep("color: var(--gold-hi)", "color: var(--gold-text)", "any");
rep("outline: 2px solid var(--gold)", "outline: 2px solid var(--gold-text)", "any");

// цвета, прописанные вручную
rep("#312b24", "#e3d2b4", "any");
rep("#2c2721", "#e4d6bf", "any");
rep("#ee8f78", "#b3361c", "any");
rep("%23c9a46a", "%23964a0a", "any");
rep("rgba(201, 164, 106, 0.45)", "rgba(150, 74, 10, 0.4)", "any");
rep("rgba(0, 0, 0, 0.5)", "rgba(58, 28, 16, 0.22)", "any");
rep("rgba(8, 7, 6, 0.66)", "rgba(58, 28, 16, 0.42)", "any");

// правки, которых требует светлый фон
const light = `
      /* Светлая версия */
      .now strong { color: var(--green-text); }
      .badge { color: var(--gold); }
      .hero-cap, .visit h2 { color: #fff8ee; }
      .hero-cap { text-shadow: 0 1px 10px rgba(0, 0, 0, 0.7); }
      .strip { background: var(--bg); }
      .field input, .field select, .field textarea, .opt-box, .stepper output { box-shadow: inset 0 0 0 1px #dcc8a6; }
      .opt input:checked + .opt-box { box-shadow: none; }
      @media (min-width: 900px) {
        .hero-bg { left: 50%; }
        .hero-bg::after { display: none; }
        .hero-copy { grid-column: 1 / 7; padding-right: 24px; }
        .bar-right .link { color: #fff8ee; }
      }
      @media (max-width: 899px) {
        .hero-bg { position: relative; inset: auto; order: 1; flex: none; height: 44svh; min-height: 260px; margin: 16px calc(-1 * var(--m)) 0; }
        .hero-bg::before, .hero-bg::after { display: none; }
        .hero-copy { order: 2; margin-top: 0; padding: 32px 0; }
      }
</style>`;
rep("</style>", light);

const leftover = s.match(/#(12100e|1c1916|26221d|ebebe9|b3a999|c9a46a|dbb983|15120f)\b/gi);
if (leftover) throw new Error("остались тёмные цвета: " + leftover.join(", "));
fs.writeFileSync(path.join(here, "index.html"), s);
console.log("готово:", path.join(here, "index.html"));
