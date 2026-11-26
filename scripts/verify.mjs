// Fase 4: verificación del pipeline.
// Imprime el reporte en consola y lo guarda en data/verificacion.md.
// Sale con código 1 si hay documentos sin indexar sin explicación.
//
// Uso: npm run verify

import fs from "node:fs/promises";
import path from "node:path";
import { PATHS, readJSON, exists } from "./lib/common.mjs";

const manifest = await readJSON(PATHS.manifest);
const stats = (await exists(PATHS.indexStats)) ? await readJSON(PATHS.indexStats) : null;
const byId = new Map((stats?.documentos || []).map((d) => [d.id, d]));

const metas = new Map();
for (const d of manifest.documentos) {
  const p = path.join(PATHS.text, d.id, "meta.json");
  if (await exists(p)) metas.set(d.id, await readJSON(p));
}

const pdfs = manifest.documentos.filter((d) => d.tipo === "pdf");
const hojas = manifest.documentos.filter((d) => d.tipo === "hoja");
const paginasTotales = pdfs.reduce((s, d) => s + (d.paginas || 0), 0);
const conOcr = pdfs.filter((d) => metas.get(d.id)?.ocr);
const fallidos = manifest.documentos.filter((d) => metas.get(d.id)?.error || d.error_pdfinfo);
const vacias = pdfs
  .map((d) => ({ d, v: byId.get(d.id)?.paginasVacias || [] }))
  .filter(({ v }) => v.length);
const sinUrl = manifest.documentos.filter((d) => !d.url_original);

const sinIndexar = manifest.documentos
  .map((d) => ({ d, s: byId.get(d.id) }))
  .filter(({ s }) => !s || s.registros === 0)
  .map(({ d, s }) => ({
    d,
    motivo: s?.error || s?.motivo || metas.get(d.id)?.error || d.motivo || null,
  }));
const sinExplicacion = sinIndexar.filter((x) => !x.motivo);

const L = [];
L.push(`# Verificación del pipeline`, "");
L.push(`Generado: ${new Date().toISOString()}`, "");
L.push(`## Totales`, "");
L.push(`| | |`, `|---|---|`);
L.push(`| Archivos en el manifiesto | ${manifest.total} |`);
for (const [t, n] of Object.entries(manifest.por_tipo)) L.push(`| — ${t} | ${n} |`);
L.push(`| Páginas de PDF (según pdfinfo) | ${paginasTotales} |`);
L.push(`| Páginas indexadas | ${stats?.paginasIndexadas ?? "—"} |`);
L.push(`| Páginas vacías (sin texto ni tras OCR) | ${stats?.paginasVacias ?? "—"} |`);
L.push(`| Filas de hojas indexadas | ${stats?.filasIndexadas ?? "—"} |`);
L.push(`| Registros en el índice | ${stats?.registros ?? "—"} |`);
L.push(`| PDFs que requirieron OCR | ${conOcr.length} |`);
L.push(`| Archivos con error | ${fallidos.length} |`);
L.push(`| Archivos sin URL original | ${sinUrl.length} |`);
if (stats?.indice) {
  L.push(`| Tamaño del índice | ${(stats.indice.bytes / 1024 ** 2).toFixed(1)} MB en ${stats.indice.archivos} archivos |`);
}
L.push("");

L.push(`## Archivos que fallaron`, "");
if (!fallidos.length) L.push("Ninguno.");
for (const d of fallidos) L.push(`- \`${d.ruta}\`: ${metas.get(d.id)?.error || d.error_pdfinfo}`);
L.push("");

L.push(`## Archivos sin indexar`, "");
if (!sinIndexar.length) L.push("Ninguno.");
for (const { d, motivo } of sinIndexar) L.push(`- \`${d.ruta}\`: ${motivo || "**SIN EXPLICACIÓN**"}`);
L.push("");

L.push(`## Páginas vacías por documento`, "");
L.push("Pueden ser páginas en blanco, totalmente tachadas o con OCR fallido. Conviene revisar una muestra.", "");
if (!vacias.length) L.push("Ninguna.");
for (const { d, v } of vacias) {
  L.push(`- \`${d.ruta}\` (${v.length} de ${d.paginas}): ${v.join(", ")}`);
}
L.push("");

L.push(`## PDFs que pasaron por OCR`, "");
if (!conOcr.length) L.push("Ninguno.");
for (const d of conOcr) {
  const m = metas.get(d.id);
  L.push(
    `- \`${d.ruta}\`: OCR en páginas ${m.paginasSinTexto.join(", ")}; ` +
      `con texto recuperado: ${(m.paginasOCR || []).join(", ") || "ninguna"}`,
  );
}
L.push("");

const report = L.join("\n");
await fs.writeFile(PATHS.report, report);
console.log(report);
console.log(`Reporte guardado en ${path.relative(PATHS.root, PATHS.report) || PATHS.report}`);

if (sinExplicacion.length) {
  console.error(`\n✗ ${sinExplicacion.length} archivo(s) sin indexar sin explicación.`);
  process.exit(1);
}
