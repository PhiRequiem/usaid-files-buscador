// Fase 3: índice Pagefind en public/pagefind/.
//
// Un registro por página de PDF y por fila de hoja de cálculo.
// - content: texto normalizado (minúsculas, sin diacríticos) → búsqueda
//   insensible a acentos.
// - meta.texto: texto original (sin normalizar) para mostrar y resaltar el
//   fragmento en el navegador. Pagefind solo lo descarga para los resultados.
//
// Uso: npm run index

import fs from "node:fs/promises";
import path from "node:path";
import * as pagefind from "pagefind";
import { PATHS, normalize, readJSON, writeJSON, exists, pad, usefulChars } from "./lib/common.mjs";
import { INDEX_LANGUAGE } from "./config.mjs";

const manifest = await readJSON(PATHS.manifest);

const { index, errors } = await pagefind.createIndex({ forceLanguage: INDEX_LANGUAGE });
if (errors.length) throw new Error(errors.join("\n"));

const stats = {
  generado: new Date().toISOString(),
  registros: 0,
  paginasIndexadas: 0,
  filasIndexadas: 0,
  paginasVacias: 0,
  documentos: [],
};

async function add(record) {
  const res = await index.addCustomRecord({ ...record, language: INDEX_LANGUAGE });
  if (res.errors.length) throw new Error(res.errors.join("; "));
  stats.registros++;
}

for (const doc of manifest.documentos) {
  const dir = path.join(PATHS.text, doc.id);
  const metaPath = path.join(dir, "meta.json");
  const entry = { id: doc.id, tipo: doc.tipo, registros: 0 };
  stats.documentos.push(entry);

  if (doc.tipo !== "pdf" && doc.tipo !== "hoja") {
    entry.motivo = doc.motivo || `tipo "${doc.tipo}" no se indexa`;
    continue;
  }
  if (!(await exists(metaPath))) {
    entry.motivo = "sin extracción (corre npm run extract)";
    continue;
  }
  const meta = await readJSON(metaPath);
  if (meta.error) entry.error = meta.error;

  const base = {
    titulo: doc.titulo,
    doc: doc.id,
    archivo: doc.archivo,
    url_original: doc.url_original || "",
    url_archivo: doc.url_archivo || "",
  };

  if (doc.tipo === "pdf") {
    const files = (await fs.readdir(dir)).filter((f) => /^p\d+\.txt$/.test(f)).sort();
    for (const f of files) {
      const pagina = Number(f.slice(1, -4));
      const texto = (await fs.readFile(path.join(dir, f), "utf8")).replace(/[ \t]+\n/g, "\n").trimEnd();
      // Se indexa toda página con al menos una letra o número: hay páginas
      // cortas con contenido útil (p. ej. una diapositiva con solo el nombre de
      // un país). El umbral MIN_USEFUL_CHARS solo decide cuándo aplicar OCR.
      if (usefulChars(texto) === 0) {
        stats.paginasVacias++;
        (entry.paginasVacias ||= []).push(pagina);
        continue;
      }
      await add({
        url: `/r/${doc.id}/p${pad(pagina)}`,
        content: normalize(texto),
        meta: { ...base, pagina: String(pagina), texto },
      });
      entry.registros++;
      stats.paginasIndexadas++;
    }
  } else {
    const rowsPath = path.join(dir, "rows.jsonl");
    const lines = (await exists(rowsPath)) ? (await fs.readFile(rowsPath, "utf8")).split("\n").filter(Boolean) : [];
    for (const line of lines) {
      const { hoja, fila, celdas } = JSON.parse(line);
      const texto = celdas.map(([h, v]) => `${h}: ${v}`).join(" · ");
      await add({
        url: `/r/${doc.id}/${encodeURIComponent(hoja)}/f${fila}`,
        content: normalize(texto),
        meta: { ...base, hoja, fila: String(fila), texto },
      });
      entry.registros++;
      stats.filasIndexadas++;
    }
  }
  if (!entry.registros && !entry.error) entry.motivo = "no tiene texto indexable";
}

await fs.rm(PATHS.pagefindOut, { recursive: true, force: true });
const written = await index.writeFiles({ outputPath: PATHS.pagefindOut });
if (written.errors.length) throw new Error(written.errors.join("\n"));
await pagefind.close();

// La app usa solo la API (pagefind.js + worker + wasm + índice). Se quitan los
// archivos de las interfaces prediseñadas de Pagefind, que no se usan.
for (const f of await fs.readdir(PATHS.pagefindOut)) {
  if (/^pagefind-(component-ui|modular-ui|ui|highlight)\.(js|css)$/.test(f)) {
    await fs.rm(path.join(PATHS.pagefindOut, f));
  }
}

// Tamaño del índice generado.
let bytes = 0;
let archivos = 0;
async function du(d) {
  for (const e of await fs.readdir(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) await du(p);
    else {
      bytes += (await fs.stat(p)).size;
      archivos++;
    }
  }
}
await du(PATHS.pagefindOut);
stats.indice = { archivos, bytes };
await writeJSON(PATHS.indexStats, stats);

console.log(
  `✓ ${stats.registros} registros (${stats.paginasIndexadas} páginas, ${stats.filasIndexadas} filas); ` +
    `${stats.paginasVacias} páginas vacías omitidas.`,
);
console.log(`  Índice: ${archivos} archivos, ${(bytes / 1024 ** 2).toFixed(1)} MB en ${path.relative(PATHS.root, PATHS.pagefindOut)}`);
