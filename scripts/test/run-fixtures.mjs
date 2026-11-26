// Prueba completa con datos ficticios, sin tocar data/ ni public/pagefind:
// genera los datos de prueba, corre todo el pipeline, arma un sitio aparte
// en data/e2e/site con ese índice y corre la prueba E2E de privacidad.
//
// Uso: npm run test:fixtures

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const E2E = path.join(ROOT, "data/e2e");
const env = { ...process.env, DATA_DIR: E2E, PAGEFIND_OUT: path.join(E2E, "pagefind") };
const node = (args, extraEnv = env) => execFileSync(process.execPath, args, { cwd: ROOT, env: extraEnv, stdio: "inherit" });
const step = (s) => console.log(`\n=== ${s} ===`);

step("Datos de prueba");
node(["scripts/test/fixtures.mjs", E2E], process.env);
for (const s of ["unpack.mjs", "manifest.mjs", "extract.mjs", "index.mjs", "verify.mjs"]) {
  step(s);
  node([`scripts/${s}`, ...(s === "unpack.mjs" || s === "extract.mjs" ? ["--force"] : [])]);
}

step("Build del sitio de prueba");
const site = path.join(E2E, "site");
execFileSync(path.join(ROOT, "node_modules/.bin/vite"), ["build", "--outDir", site, "--emptyOutDir", "--logLevel", "warn"], { cwd: ROOT, stdio: "inherit" });
fs.rmSync(path.join(site, "pagefind"), { recursive: true, force: true });
fs.cpSync(path.join(E2E, "pagefind"), path.join(site, "pagefind"), { recursive: true });

step("Prueba E2E");
node(
  ["scripts/test/e2e-privacy.mjs", "--outDir", site, "--cases", "scripts/test/e2e-cases.example.json", "--screenshot", path.join(E2E, "movil.png")],
  process.env,
);
