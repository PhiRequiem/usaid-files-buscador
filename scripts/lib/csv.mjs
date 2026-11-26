// Parser CSV mínimo (RFC 4180): comillas, comillas escapadas y saltos de
// línea dentro de celdas. Sin dependencias.

export function parseCSV(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // BOM
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

// Elige la fila de encabezados: la primera (de las primeras 20) que tenga al
// menos la mitad de las columnas no vacías que tiene la fila más llena.
// Así se saltan filas de título tipo "USAID Activity List" arriba de la tabla.
export function findHeaderRow(rows) {
  const filled = (r) => r.filter((c) => c.trim() !== "").length;
  const sample = rows.slice(0, 20);
  const max = Math.max(0, ...sample.map(filled));
  if (max === 0) return -1;
  return sample.findIndex((r) => filled(r) >= Math.max(1, Math.ceil(max / 2)));
}
