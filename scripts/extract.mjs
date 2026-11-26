// Fase 2: extracción de texto.
//
// - PDFs: pdftotext -layout, una salida por página en data/text/<id>/p0001.txt.
// - Páginas sin texto útil: el PDF pasa por ocrmypdf (eng+spa, --skip-text)
//   a data/ocr/<id>.pdf y se vuelve a extraer el texto de esas páginas.
// - Hojas de cálculo: xlsx2csv (todas las hojas), una fila por línea en
//   data/text/<id>/rows.jsonl, con sus encabezados.
// - Estado por documento en data/text/<id>/meta.json.
//
// Es reanudable: salta los documentos que ya tienen meta.json sin error.
// Uso: npm run extract [-- --force] [-- --only=<id>]

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  PATHS, run, readJSON, writeJSON, exists, pool, pad, usefulChars, MIN_USEFUL_CHARS,
} from "./lib/common.mjs";
import { parseCSV, findHeaderRow } from "./lib/csv.mjs";
import { OCR_ARGS } from "./config.mjs";

const force = process.argv.includes("--force");
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);
const CONCURRENCY = Math.max(1, os.cpus().length - 1);

const errMsg = (e) => ((e.stderr || "").trim() || e.message).split("\n").slice(-3).join(" | ");

async function hasTool(cmd, args = ["--version"]) {
  try {
    await run(cmd, args, { timeout: 30_000 });
    return true;
  } catch {
    return false;
  }
}

// --- PDFs ------------------------------------------------------------------

async function pdftextPages(file, expectedPages) {
  // Un solo proceso por documento; pdftotext separa las páginas con \f.
  const { stdout } = await run("pdftotext", ["-layout", "-enc", "UTF-8", file, "-"]);
  let pages = stdout.split("\f");
  if (pages.length === expectedPages + 1 && pages.at(-1).trim() === "") pages.pop();
  if (pages.length === expectedPages) return pages;

  // Respaldo: página por página.
  pages = [];
  for (let p = 1; p <= expectedPages; p++) {
    const { stdout: t } = await run("pdftotext", [
      "-layout", "-enc", "UTF-8", "-f", String(p), "-l", String(p), file, "-",
    ]);
    pages.push(t.replace(/\f$/, ""));
  }
  return pages;
}

const isEmpty = (t) => usefulChars(t) < MIN_USEFUL_CHARS;

async function extractPdf(doc) {
  const src = path.join(PATHS.extracted, doc.ruta);
  if (!doc.paginas) throw new Error(doc.error_pdfinfo || "sin número de páginas");
  const pages = await pdftextPages(src, doc.paginas);
  return { pages, empty: pages.flatMap((t, i) => (isEmpty(t) ? [i + 1] : [])) };
}

async function ocrPdf(doc, state) {
  const src = path.join(PATHS.extracted, doc.ruta);
  const out = path.join(PATHS.ocr, `${doc.id}.pdf`);
  await fs.mkdir(PATHS.ocr, { recursive: true });
  await run("ocrmypdf", [...OCR_ARGS, src, out], { timeout: 90 * 60_000 });
  const ocrPages = await pdftextPages(out, doc.paginas);
  for (const p of state.empty) state.pages[p - 1] = ocrPages[p - 1];
}

async function writePages(dir, pages) {
  for (let i = 0; i < pages.length; i++) {
    await fs.writeFile(path.join(dir, `p${pad(i + 1)}.txt`), pages[i]);
  }
}

// --- Hojas de cálculo ------------------------------------------------------

function colName(i) {
  let s = "";
  for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
}

function sheetToRecords(sheetName, rows) {
  const h = findHeaderRow(rows);
  if (h < 0) return [];
  const headers = rows[h].map((c, i) => c.trim() || `Columna ${colName(i)}`);
  const records = [];
  for (let r = h + 1; r < rows.length; r++) {
    const celdas = rows[r]
      .map((v, i) => [headers[i] || `Columna ${colName(i)}`, v.trim()])
      .filter(([, v]) => v !== "");
    if (celdas.length) records.push({ hoja: sheetName, fila: r + 1, celdas });
  }
  return records;
}

async function extractSheet(doc, dir) {
  const src = path.join(PATHS.extracted, doc.ruta);
  const sheets = []; // [nombre, filas]
  if (path.extname(src).toLowerCase() === ".csv") {
    sheets.push([path.basename(src, ".csv"), parseCSV(await fs.readFile(src, "utf8"))]);
  } else {
    const csvDir = path.join(dir, "csv");
    await fs.rm(csvDir, { recursive: true, force: true });
    await fs.mkdir(csvDir, { recursive: true });
    await run("xlsx2csv", ["-a", src, csvDir], { timeout: 10 * 60_000 });
    for (const f of (await fs.readdir(csvDir)).sort()) {
      if (!f.endsWith(".csv")) continue;
      sheets.push([f.slice(0, -4), parseCSV(await fs.readFile(path.join(csvDir, f), "utf8"))]);
    }
  }
  const records = sheets.flatMap(([name, rows]) => sheetToRecords(name, rows));
  await fs.writeFile(
    path.join(dir, "rows.jsonl"),
    records.map((r) => JSON.stringify(r)).join("\n") + (records.length ? "\n" : ""),
  );
  return { hojas: sheets.map(([n, rows]) => ({ nombre: n, filas: rows.length })), filas: records.length };
}

// --- Principal -------------------------------------------------------------

const manifest = await readJSON(PATHS.manifest);
const docs = manifest.documentos.filter(
  (d) => (d.tipo === "pdf" || d.tipo === "hoja") && (!only || d.id === only),
);

const ocrAvailable = await hasTool("ocrmypdf");
const xlsxAvailable = await hasTool("xlsx2csv", ["--help"]);
if (!ocrAvailable) console.warn("⚠ ocrmypdf no está instalado: las páginas escaneadas quedarán vacías.");

async function pending(doc) {
  const metaPath = path.join(PATHS.text, doc.id, "meta.json");
  if (force || !(await exists(metaPath))) return true;
  const meta = await readJSON(metaPath);
  return Boolean(meta.error);
}

const todo = [];
for (const d of docs) if (await pending(d)) todo.push(d);
console.log(`Documentos: ${docs.length}, por procesar: ${todo.length}`);

const needOcr = [];
let done = 0;

await pool(todo, CONCURRENCY, async (doc) => {
  const dir = path.join(PATHS.text, doc.id);
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
  const meta = { id: doc.id, tipo: doc.tipo, ruta: doc.ruta, ocr: false };
  try {
    if (doc.tipo === "pdf") {
      const state = await extractPdf(doc);
      meta.paginas = state.pages.length;
      meta.paginasSinTexto = state.empty;
      if (state.empty.length && ocrAvailable) {
        needOcr.push({ doc, dir, meta, state });
        return; // se termina en la etapa de OCR
      }
      if (state.empty.length) meta.error = "páginas sin texto y ocrmypdf no disponible";
      meta.paginasVacias = state.empty;
      await writePages(dir, state.pages);
    } else {
      if (!xlsxAvailable && !doc.ruta.toLowerCase().endsWith(".csv")) {
        throw new Error("xlsx2csv no está instalado");
      }
      Object.assign(meta, await extractSheet(doc, dir));
    }
  } catch (e) {
    meta.error = errMsg(e);
  }
  await writeJSON(path.join(dir, "meta.json"), meta);
  console.log(`  [${++done}/${todo.length}] ${meta.error ? "✗" : "✓"} ${doc.ruta}${meta.error ? ` — ${meta.error}` : ""}`);
});

// OCR en serie: ocrmypdf ya usa todos los núcleos por su cuenta.
if (needOcr.length) console.log(`\nOCR en ${needOcr.length} documentos (puede tardar)…`);
for (const { doc, dir, meta, state } of needOcr) {
  const t0 = Date.now();
  try {
    await ocrPdf(doc, state);
    meta.ocr = true;
    // Páginas a las que el OCR sí les sacó texto.
    meta.paginasOCR = state.empty.filter((p) => !isEmpty(state.pages[p - 1]));
  } catch (e) {
    meta.error = `OCR falló: ${errMsg(e)}`;
  }
  meta.paginasVacias = state.pages.flatMap((t, i) => (isEmpty(t) ? [i + 1] : []));
  await writePages(dir, state.pages);
  await writeJSON(path.join(dir, "meta.json"), meta);
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`  [${++done}/${todo.length}] ${meta.error ? "✗" : "✓"} OCR ${doc.ruta} (${secs}s)${meta.error ? ` — ${meta.error}` : ""}`);
}

// Llevar el campo "ocr" al manifiesto.
for (const d of manifest.documentos) {
  const metaPath = path.join(PATHS.text, d.id, "meta.json");
  if (await exists(metaPath)) d.ocr = (await readJSON(metaPath)).ocr;
}
await writeJSON(PATHS.manifest, manifest);
console.log("\n✓ Extracción terminada. Siguiente: npm run index");
