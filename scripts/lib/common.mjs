// Utilidades compartidas del pipeline. Solo se corre en local.
//
// Regla de seguridad: los archivos de data/raw son NO CONFIABLES.
// Solo se leen y se pasan como argumentos a herramientas de extracción
// (pdftotext, pdfinfo, ocrmypdf, xlsx2csv). Nunca se ejecuta nada de ellos
// y nunca se usa una shell (execFile, no exec), así un nombre de archivo
// malicioso no puede inyectar comandos.

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// DATA_DIR permite correr el pipeline contra datos de prueba sin tocar data/.
export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, "data"));
export const PATHS = {
  root: ROOT,
  data: DATA_DIR,
  zip: path.join(DATA_DIR, "raw", "usaid-files.zip"),
  extracted: path.join(DATA_DIR, "raw", "extracted"),
  text: path.join(DATA_DIR, "text"),
  ocr: path.join(DATA_DIR, "ocr"),
  manifest: path.join(DATA_DIR, "manifest.json"),
  indexStats: path.join(DATA_DIR, "index-stats.json"),
  report: path.join(DATA_DIR, "verificacion.md"),
  pagefindOut: path.resolve(process.env.PAGEFIND_OUT || path.join(ROOT, "public", "pagefind")),
};

// Normalización idéntica a la del cliente (src/normalize.js).
export function normalize(s) {
  return s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

// execFile con promesa, tiempo límite y salida grande.
export function run(cmd, args, { timeout = 10 * 60_000, maxBuffer = 512 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout, maxBuffer, encoding: "utf8" }, (err, stdout, stderr) => {
      if (err) {
        err.stderr = stderr;
        reject(err);
      } else resolve({ stdout, stderr });
    });
  });
}

export async function readJSON(p) {
  return JSON.parse(await fs.readFile(p, "utf8"));
}

export async function writeJSON(p, data) {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(data, null, 2) + "\n");
}

export async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

// Ejecuta tareas con concurrencia limitada.
export async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export function pad(n, width = 4) {
  return String(n).padStart(width, "0");
}

// ¿La página tiene texto útil? (letras o dígitos, sin contar espacios ni símbolos)
export const MIN_USEFUL_CHARS = 20;
export function usefulChars(text) {
  return (text.match(/[\p{L}\p{N}]/gu) || []).length;
}
