// Fase 1b: genera data/manifest.json a partir de data/raw/extracted/.
//
// Uso: npm run manifest
// Conserva el campo "ocr" de un manifiesto anterior (lo llena extract.mjs).

import fs from "node:fs/promises";
import path from "node:path";
import { PATHS, run, readJSON, writeJSON, exists } from "./lib/common.mjs";
import { TYPES, originalUrl, archiveUrl } from "./config.mjs";

const IGNORE = (name) => name === ".DS_Store" || name === "__MACOSX" || name.startsWith("._");

function typeOf(file) {
  const ext = path.extname(file).toLowerCase();
  for (const [type, exts] of Object.entries(TYPES)) if (exts.includes(ext)) return type;
  return "otro";
}

function slug(rel) {
  return normalizeAscii(rel.replace(/\.[^.\/]+$/, ""))
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "doc";
}

function normalizeAscii(s) {
  return s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

// Título legible a partir del nombre de archivo. Los archivos del ZIP se llaman
// "<slug>-<hash de 12 hex>.<ext>": se quita el hash, los guiones pasan a
// espacios y la primera letra va en mayúscula.
function titleFrom(file) {
  const t = path
    .basename(file, path.extname(file))
    .replace(/-[0-9a-f]{12}$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

async function pdfPages(file) {
  try {
    const { stdout } = await run("pdfinfo", [file], { timeout: 60_000 });
    const m = stdout.match(/^Pages:\s+(\d+)/m);
    return m ? Number(m[1]) : null;
  } catch (e) {
    return { error: (e.stderr || e.message).trim().split("\n")[0] };
  }
}

async function walk(dir, out = []) {
  for (const d of await fs.readdir(dir, { withFileTypes: true })) {
    if (IGNORE(d.name)) continue;
    const p = path.join(dir, d.name);
    if (d.isDirectory()) await walk(p, out);
    else if (d.isFile()) out.push(p);
  }
  return out;
}

if (!(await exists(PATHS.extracted))) {
  console.error("✗ No existe data/raw/extracted. Corre primero: npm run unpack");
  process.exit(1);
}

const previous = (await exists(PATHS.manifest)) ? await readJSON(PATHS.manifest) : null;
const prevById = new Map((previous?.documentos || []).map((d) => [d.id, d]));

const files = (await walk(PATHS.extracted)).sort((a, b) => a.localeCompare(b));
const used = new Set();
const documentos = [];

for (const abs of files) {
  const ruta = path.relative(PATHS.extracted, abs);
  const archivo = path.basename(abs);
  const tipo = typeOf(abs);

  let id = slug(ruta);
  for (let n = 2; used.has(id); n++) id = `${slug(ruta)}-${n}`;
  used.add(id);

  const entry = {
    id,
    archivo,
    ruta,
    tipo,
    titulo: titleFrom(archivo),
    paginas: null,
    ocr: prevById.get(id)?.ocr ?? null,
    url_original: null,
    url_archivo: null,
    bytes: (await fs.stat(abs)).size,
  };

  if (tipo === "pdf") {
    const pages = await pdfPages(abs);
    if (typeof pages === "number") entry.paginas = pages;
    else entry.error_pdfinfo = pages?.error || "sin número de páginas";
  }
  if (tipo === "video") {
    entry.indexado = false;
    entry.motivo = "video: fuera de alcance";
  }

  entry.url_original = originalUrl(entry);
  entry.url_archivo = archiveUrl(entry.url_original);
  documentos.push(entry);
}

const resumen = {};
for (const d of documentos) resumen[d.tipo] = (resumen[d.tipo] || 0) + 1;

await writeJSON(PATHS.manifest, {
  generado: new Date().toISOString(),
  total: documentos.length,
  por_tipo: resumen,
  documentos,
});

console.log(`✓ Manifiesto con ${documentos.length} archivos:`, resumen);
const sinUrl = documentos.filter((d) => !d.url_original).length;
if (sinUrl) console.log(`  ⚠ ${sinUrl} sin URL original (patrón pendiente en scripts/config.mjs)`);
const errores = documentos.filter((d) => d.error_pdfinfo);
for (const d of errores) console.log(`  ⚠ pdfinfo falló en ${d.ruta}: ${d.error_pdfinfo}`);
