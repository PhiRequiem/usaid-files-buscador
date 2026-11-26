// Prueba E2E de privacidad y búsqueda con Chrome headless (protocolo DevTools,
// sin dependencias). Comprueba, para cada caso:
//   - que ninguna petición de red (página o worker) contenga el término,
//   - que no haya peticiones fuera del propio sitio,
//   - que no haya errores de consola ni violaciones de CSP,
//   - que con acentos y sin acentos salgan los mismos resultados,
//   - las expectativas del caso (mínimo de resultados, ninguno, etc.).
//
// Uso:
//   node scripts/test/e2e-privacy.mjs [--cases archivo.json] [--url http://...] [--outDir dist]
//                                     [--screenshot salida.png]
// Sin --url, levanta `vite preview` de --outDir (por defecto dist/) en el puerto 4174
// con los mismos headers de vercel.json.
//
// Casos: data/e2e-cases.json (no se sube: contiene términos reales) o
// scripts/test/e2e-cases.example.json (datos ficticios). Formato:
//   [{ "nombre": "...", "variantes": ["..."], "tambien": "filtro opcional",
//      "minimo": 1, "ninguno": false,
//      "incluye": ["texto que debe aparecer en algún título o ubicación"] }]

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};

const casesFile = arg(
  "cases",
  fs.existsSync(path.join(ROOT, "data/e2e-cases.json"))
    ? path.join(ROOT, "data/e2e-cases.json")
    : path.join(ROOT, "scripts/test/e2e-cases.example.json"),
);
const cases = JSON.parse(fs.readFileSync(casesFile, "utf8"));
const outDir = arg("outDir", "dist");
const screenshot = arg("screenshot", null);
let baseUrl = arg("url", null);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const normalize = (s) => s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
const children = [];
function cleanup() {
  for (const c of children) c.kill();
}
process.on("exit", cleanup);

// --- Servidor --------------------------------------------------------------
if (!baseUrl) {
  const PORT = 4174;
  baseUrl = `http://localhost:${PORT}/`;
  const vite = spawn(
    path.join(ROOT, "node_modules/.bin/vite"),
    ["preview", "--port", String(PORT), "--strictPort", "--outDir", outDir],
    { cwd: ROOT, stdio: "ignore" },
  );
  children.push(vite);
  for (let i = 0; i < 50; i++) {
    await sleep(200);
    try {
      if ((await fetch(baseUrl)).ok) break;
    } catch {}
  }
}
const origin = new URL(baseUrl).origin;

// --- Chrome ----------------------------------------------------------------
const chromePath =
  process.env.CHROME_PATH ||
  [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  ].find((p) => fs.existsSync(p));
if (!chromePath) {
  console.error("✗ No encontré Chrome/Chromium/Brave. Define CHROME_PATH.");
  process.exit(2);
}
const CDP_PORT = 9335;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-chrome-"));
const chrome = spawn(
  chromePath,
  [
    "--headless=new", `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--disable-extensions",
    "--disable-sync", "--disable-background-networking", "about:blank",
  ],
  { stdio: "ignore" },
);
children.push(chrome);

let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try {
    target = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: "PUT" })).json();
  } catch {}
}
if (!target) {
  console.error("✗ Chrome no respondió.");
  process.exit(2);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let nextId = 1;
const pending = new Map();
const requests = [];
const problems = [];
const send = (method, params = {}, sessionId) =>
  new Promise((res, rej) => {
    const id = nextId++;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });

ws.addEventListener("message", async (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? p.rej(new Error(JSON.stringify(msg.error))) : p.res(msg.result);
    return;
  }
  const where = msg.sessionId ? "worker" : "página";
  const p = msg.params;
  switch (msg.method) {
    case "Target.attachedToTarget":
      for (const m of ["Network.enable", "Runtime.enable", "Runtime.runIfWaitingForDebugger"]) {
        await send(m, {}, p.sessionId).catch(() => {});
      }
      break;
    case "Network.requestWillBeSent":
      requests.push({ where, url: p.request.url, body: p.request.postData || "", headers: JSON.stringify(p.request.headers) });
      break;
    case "Log.entryAdded":
      if (["error", "warning"].includes(p.entry.level)) problems.push(`[${where}] ${p.entry.text}`);
      break;
    case "Runtime.exceptionThrown":
      problems.push(`[${where} excepción] ${p.exceptionDetails.exception?.description || p.exceptionDetails.text}`);
      break;
    case "Runtime.consoleAPICalled":
      if (["error", "warning"].includes(p.type)) {
        problems.push(`[${where} console.${p.type}] ${p.args.map((a) => a.value ?? a.description).join(" ")}`);
      }
      break;
  }
});

await send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
for (const m of ["Network.enable", "Runtime.enable", "Log.enable", "Page.enable"]) await send(m);

const evaluate = async (expression) =>
  (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result.value;

async function waitFor(expr, ms = 60_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await evaluate(expr)) return;
    await sleep(150);
  }
  throw new Error(`Tiempo agotado esperando: ${expr}`);
}

const APP = "document.querySelector('.app')";

async function search(variants, also = "") {
  await send("Page.navigate", { url: baseUrl });
  await sleep(200);
  await waitFor(`${APP}?.dataset.status === 'ready' || ${APP}?.dataset.status === 'error'`);
  if ((await evaluate(`${APP}.dataset.status`)) === "error") throw new Error("La app no pudo cargar Pagefind");
  for (const v of variants) {
    await evaluate(`(() => {
      const i = document.querySelector('#variant');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(v)});
      i.dispatchEvent(new Event('input', { bubbles: true }));
      i.closest('.input-group').querySelector('button').click();
    })()`);
  }
  await evaluate(`(() => {
    const i = document.querySelector('#also');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(also)});
    i.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await evaluate(`document.querySelector('button[type=submit]').click()`);
  await waitFor(`${APP}.dataset.searched === 'true' && ${APP}.dataset.searching === 'false'`);
  // Mostrar todos los resultados (no solo la primera página).
  while (await evaluate(`!!document.querySelector('section[aria-live] > button')`)) {
    await evaluate(`document.querySelector('section[aria-live] > button').click()`);
    await sleep(50);
  }
  return evaluate(`[...document.querySelectorAll('section[aria-live] ol > li')].map(li => ({
    titulo: li.querySelector('h3')?.textContent.trim(),
    ubicacion: li.querySelector('h3 + div')?.textContent.trim().replace(/\\s+/g, ' '),
    coincide: [...li.querySelectorAll('.badge')].map(b => b.textContent.trim()),
    marcas: [...li.querySelectorAll('mark')].map(m => m.textContent),
  }))`);
}

const key = (items) => items.map((i) => `${i.titulo}|${i.ubicacion}`).sort().join("\n");

// --- Casos -----------------------------------------------------------------
const failures = [];
const lines = [];
for (const c of cases) {
  const startReq = requests.length;
  const also = c.tambien || "";
  const items = await search(c.variantes, also);
  const plain = c.variantes.map(normalize);
  const accentsDiffer = plain.some((p, i) => p !== c.variantes[i]) || normalize(also) !== also;
  const itemsPlain = accentsDiffer ? await search(plain, normalize(also)) : items;
  const reqs = requests.slice(startReq);

  const errs = [];
  if (c.ninguno && items.length) errs.push(`esperaba 0 resultados y hubo ${items.length}`);
  if (c.minimo && items.length < c.minimo) errs.push(`esperaba al menos ${c.minimo} y hubo ${items.length}`);
  for (const inc of c.incluye || []) {
    if (!items.some((i) => `${i.titulo} ${i.ubicacion}`.includes(inc))) errs.push(`falta un resultado con "${inc}"`);
  }
  if (accentsDiffer && key(items) !== key(itemsPlain)) errs.push("con y sin acentos dan resultados distintos");
  for (const i of items) if (!i.marcas.length) errs.push(`resultado sin resaltado: ${i.titulo} (${i.ubicacion})`);

  // ¿Alguna petición lleva el término (original, normalizado, codificado o palabras sueltas)?
  const needles = [...c.variantes, ...(also ? [also] : [])].flatMap((v) => {
    const n = normalize(v);
    return [v, n, encodeURIComponent(v), encodeURIComponent(n), ...n.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 4)];
  }).map((s) => s.toLowerCase());
  // Coincidencia como palabra completa: "meta" no debe contar dentro de
  // "pagefind.en_xxx.pf_meta" (nombre fijo del build), pero sí en "?q=meta".
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const res = needles.map((n) => new RegExp(`(?<![\\p{L}\\p{N}_])${esc(n)}(?![\\p{L}\\p{N}_])`, "u"));
  const leaks = reqs.filter((r) => res.some((re) => re.test((r.url + r.body + r.headers).toLowerCase())));
  if (leaks.length) errs.push(`el término aparece en ${leaks.length} petición(es): ${leaks.map((l) => l.url).join(", ")}`);

  lines.push(`${errs.length ? "✗" : "✓"} ${c.nombre}: ${items.length} resultado(s), ${reqs.length} petición(es)`);
  for (const e of errs) lines.push(`    - ${e}`);
  if (errs.length) failures.push(c.nombre);
}

const external = requests.filter((r) => !r.url.startsWith(origin) && !/^(data|about|blob):/.test(r.url));
lines.push(`${external.length ? "✗" : "✓"} Peticiones fuera de ${origin}: ${external.length}`);
for (const r of external) lines.push(`    - ${r.url}`);
const uniqProblems = [...new Set(problems)];
lines.push(`${uniqProblems.length ? "✗" : "✓"} Errores de consola o CSP: ${uniqProblems.length}`);
for (const p of uniqProblems) lines.push(`    - ${p}`);

if (screenshot && cases.length) {
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await search(cases[0].variantes, cases[0].tambien || "");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 2400, deviceScaleFactor: 1, mobile: true });
  await sleep(300);
  const shot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(screenshot, Buffer.from(shot.data, "base64"));
  lines.push(`  Captura móvil: ${screenshot}`);
}

console.log(`Casos: ${path.relative(ROOT, casesFile)} · Sitio: ${baseUrl}\n`);
console.log(lines.join("\n"));
ws.close();
// Cerrar Chrome y esperar antes de borrar su perfil temporal.
await new Promise((r) => {
  chrome.once("exit", r);
  chrome.kill();
  setTimeout(r, 5000);
});
try {
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
} catch {}
const failed = failures.length || external.length || uniqProblems.length;
console.log(failed ? "\n✗ La prueba FALLÓ." : "\n✓ Todo bien.");
process.exit(failed ? 1 : 0);
