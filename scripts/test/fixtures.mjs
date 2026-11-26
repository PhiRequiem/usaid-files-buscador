// Genera datos de prueba FICTICIOS para el pipeline: un PDF con texto (con una
// página en blanco), un PDF escaneado (solo imagen), un xlsx con fila de título
// y un video vacío, empaquetados en <dir>/raw/usaid-files.zip.
// Uso: node scripts/test/fixtures.mjs <dir>   (luego DATA_DIR=<dir> npm run unpack ...)
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const out = path.resolve(process.argv[2] || "data/e2e");
const src = path.join(out, "src");
// Protección: solo se borra una carpeta creada antes por este script (marcador).
const MARKER = path.join(out, ".fixtures");
if (fs.existsSync(out) && fs.readdirSync(out).length && !fs.existsSync(MARKER)) {
  console.error(`✗ ${out} existe y no es una carpeta de datos de prueba. No la toco.`);
  process.exit(1);
}
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(MARKER, "Carpeta generada por scripts/test/fixtures.mjs\n");
fs.mkdirSync(path.join(src, "memos"), { recursive: true });

// PDF mínimo con Helvetica + WinAnsiEncoding (acentos en Latin-1).
function makePdf(pages) {
  const objs = [];
  const add = (s) => (objs.push(s), objs.length);
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const pagesId = objs.length + 1 + pages.length * 2;
  const kids = [];
  for (const lines of pages) {
    const esc = (t) => t.replace(/[\\()]/g, "\\$&");
    const body = lines.map((l, i) => `BT /F1 12 Tf 72 ${720 - i * 18} Td (${esc(l)}) Tj ET`).join("\n");
    const bytes = Buffer.from(body, "latin1");
    const c = add(`<< /Length ${bytes.length} >>\nstream\n${body}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${c} 0 R >>`));
  }
  add(`<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`);
  const cat = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  let pdf = "%PDF-1.4\n";
  const offs = [];
  objs.forEach((o, i) => {
    offs.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  pdf += offs.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root ${cat} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

// 1. PDF con texto (3 páginas, la 2 en blanco a propósito).
fs.writeFileSync(
  path.join(src, "memos", "Memo_Prueba_Ficticio.pdf"),
  makePdf([
    [
      "DOCUMENTO FICTICIO DE PRUEBA",
      "Award No. 72099999CA00001 - Fundación Ejemplo para la Defensa",
      "Contacto: info@ejemplo-ficticio.org",
      "Socio: Red Ficticia de Periodistas (REFIPE), Bogotá",
    ],
    [""],
    [
      "Página tres del memo ficticio.",
      "Menciona a la Asociación Señal Clara y a la persona Ana Pérez Núñez.",
    ],
  ]),
);

// 2. PDF escaneado: se rasteriza una página a imagen y se vuelve PDF (sin capa de texto).
const tmp = path.join(out, "tmp");
fs.mkdirSync(tmp);
fs.writeFileSync(
  path.join(tmp, "scan-src.pdf"),
  makePdf([
    [
      "SCANNED FICTITIOUS LETTER",
      "Implementing partner: Colectivo Imaginario de Derechos Humanos",
      "Country: Guatemala. Program officer: Jorge Ramírez",
      "Unique word for OCR test: zarzamoraplex",
    ],
  ]),
);
execFileSync("pdftoppm", ["-r", "200", "-png", "-singlefile", path.join(tmp, "scan-src.pdf"), path.join(tmp, "scan")]);
execFileSync("sips", ["-s", "format", "pdf", path.join(tmp, "scan.png"), "--out", path.join(src, "Carta_Escaneada_Ficticia.pdf")], { stdio: "ignore" });

// 3. Hoja de cálculo (xlsx mínimo con inlineStr). Fila de título arriba de los encabezados.
const rows = [
  ["Lista ficticia de actividades"],
  [],
  ["Activity Name", "Implementing Partner", "Country", "Award Number"],
  ["Programa Voces Libres", "Fundación Ejemplo para la Defensa", "Colombia", "72099999CA00001"],
  ["Proyecto Imaginario", "Colectivo Imaginario de Derechos Humanos", "Guatemala", "72099999CA00002"],
  ["Iniciativa Señal", "Asociación Señal Clara", "México", "72099999CA00003"],
];
const xml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const col = (i) => String.fromCharCode(65 + i);
const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows
  .map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => `<c r="${col(ci)}${ri + 1}" t="inlineStr"><is><t>${xml(v)}</t></is></c>`).join("")}</row>`)
  .join("")}</sheetData></worksheet>`;
const x = path.join(tmp, "xlsx");
const files = {
  "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
  "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Actividades" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
  "xl/worksheets/sheet1.xml": sheet,
};
for (const [p, c] of Object.entries(files)) {
  fs.mkdirSync(path.dirname(path.join(x, p)), { recursive: true });
  fs.writeFileSync(path.join(x, p), c);
}
execFileSync("zip", ["-q", "-X", "-r", path.join(src, "Actividades_Ficticias.xlsx"), "."], { cwd: x });

// 4. Video vacío (solo para el manifiesto).
fs.writeFileSync(path.join(src, "Video_Ficticio.mp4"), "");

// ZIP final.
fs.mkdirSync(path.join(out, "raw"), { recursive: true });
execFileSync("zip", ["-q", "-X", "-r", path.join(out, "raw", "usaid-files.zip"), "."], { cwd: src });
fs.rmSync(tmp, { recursive: true, force: true });
fs.rmSync(src, { recursive: true, force: true });
console.log(`✓ Datos de prueba en ${path.join(out, "raw", "usaid-files.zip")}`);
