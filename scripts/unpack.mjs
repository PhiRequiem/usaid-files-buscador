// Fase 1a: verifica y descomprime el ZIP en data/raw/extracted/.
//
// Trata el ZIP como no confiable:
// - confirma que de verdad es un ZIP (no una página HTML de error o de Cloudflare),
// - rechaza rutas absolutas o con "..", enlaces simbólicos y tamaños descomprimidos
//   desproporcionados (zip bomb),
// - descomprime en una carpeta nueva y vacía y quita permisos de ejecución.
//
// Uso: npm run unpack [-- --force]   (--force borra y rehace data/raw/extracted)

import crypto from "node:crypto";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { PATHS, run, exists } from "./lib/common.mjs";
import { MAX_UNZIPPED_BYTES } from "./config.mjs";

const force = process.argv.includes("--force");

function fail(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

async function sha256(file) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

if (!(await exists(PATHS.zip))) fail(`No existe ${PATHS.zip}`);

// 1. ¿Es un ZIP de verdad?
const fh = await fs.open(PATHS.zip, "r");
const head = Buffer.alloc(512);
await fh.read(head, 0, 512, 0);
await fh.close();
if (!(head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04)) {
  const txt = head.toString("utf8").toLowerCase();
  if (txt.includes("<html") || txt.includes("<!doctype")) {
    fail(
      "El archivo no es un ZIP sino una página HTML" +
        (txt.includes("just a moment") ? " (verificación anti-bots de Cloudflare)" : "") +
        ".\n  Descárgalo desde un navegador y reemplaza data/raw/usaid-files.zip.",
    );
  }
  fail("El archivo no empieza con la firma de un ZIP (PK\\x03\\x04).");
}

const { size } = await fs.stat(PATHS.zip);
const hash = await sha256(PATHS.zip);
console.log(`ZIP: ${(size / 1024 ** 2).toFixed(1)} MB`);
console.log(`SHA-256: ${hash}`);

const sumsFile = path.join(path.dirname(PATHS.zip), "SHA256SUMS.txt");
if (await exists(sumsFile)) {
  const sums = await fs.readFile(sumsFile, "utf8");
  const listed = sums.match(/^([0-9a-f]{64})\s+\*?usaid-files\.zip\s*$/m)?.[1];
  if (listed) {
    console.log(
      listed === hash
        ? "  Coincide con SHA256SUMS.txt (solo sirve si ese archivo viene de una fuente oficial)."
        : "  ⚠ NO coincide con SHA256SUMS.txt.",
    );
  }
}

// 2. Revisar el contenido antes de descomprimir.
const { stdout: names } = await run("unzip", ["-Z1", PATHS.zip]);
const entries = names.split("\n").filter(Boolean);
const bad = entries.filter(
  (n) => n.startsWith("/") || n.startsWith("\\") || /(^|[\\/])\.\.([\\/]|$)/.test(n) || /^[a-zA-Z]:/.test(n),
);
if (bad.length) fail(`Rutas peligrosas en el ZIP:\n  ${bad.join("\n  ")}`);

const { stdout: info } = await run("zipinfo", [PATHS.zip]);
const symlinks = info.split("\n").filter((l) => /^l[rwx-]{9}/.test(l));
if (symlinks.length) fail(`El ZIP contiene enlaces simbólicos:\n  ${symlinks.join("\n  ")}`);

const { stdout: listing } = await run("unzip", ["-l", PATHS.zip]);
const totalLine = listing.trim().split("\n").at(-1);
const total = Number(totalLine.trim().split(/\s+/)[0]);
if (!Number.isFinite(total)) fail(`No pude leer el tamaño descomprimido: "${totalLine}"`);
console.log(`Entradas: ${entries.length}, descomprimido: ${(total / 1024 ** 2).toFixed(1)} MB`);
if (total > MAX_UNZIPPED_BYTES) fail("Tamaño descomprimido por encima del límite (posible zip bomb).");

// 3. Descomprimir en carpeta nueva y vacía.
if (await exists(PATHS.extracted)) {
  if (!force) fail(`${PATHS.extracted} ya existe. Usa --force para rehacerla.`);
  await fs.rm(PATHS.extracted, { recursive: true, force: true });
}
await fs.mkdir(PATHS.extracted, { recursive: true });
await run("unzip", ["-q", "-n", PATHS.zip, "-d", PATHS.extracted], { timeout: 30 * 60_000 });

// 4. Revisión posterior: sin symlinks, sin permisos de ejecución.
let files = 0;
async function walk(dir) {
  for (const d of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name);
    const st = await fs.lstat(p);
    if (st.isSymbolicLink()) fail(`Enlace simbólico tras descomprimir: ${p}`);
    if (st.isDirectory()) {
      await fs.chmod(p, 0o755);
      await walk(p);
    } else if (st.isFile()) {
      await fs.chmod(p, 0o444);
      files++;
    } else fail(`Tipo de archivo inesperado: ${p}`);
  }
}
await walk(PATHS.extracted);
console.log(`✓ ${files} archivos descomprimidos en ${path.relative(PATHS.root, PATHS.extracted) || PATHS.extracted}`);
