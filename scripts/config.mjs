// Configuración del pipeline que depende de los datos reales.

// URL original en usaid.gov de cada archivo. Patrón confirmado (2026-11-25) con
// un enlace real: https://www.usaid.gov/files/<nombre del archivo en el ZIP>.
// Todos los nombres del ZIP son [a-z0-9-] más extensión; se codifica igual por
// si acaso.
export function originalUrl({ archivo }) {
  return `https://www.usaid.gov/files/${encodeURIComponent(archivo)}`;
}

export function archiveUrl(original) {
  return original ? `https://web.archive.org/web/2026/${original}` : null;
}

// Extensiones por tipo.
export const TYPES = {
  pdf: [".pdf"],
  hoja: [".xlsx", ".xlsm", ".csv"],
  video: [".mp4", ".mov", ".m4v", ".avi", ".webm", ".mkv", ".wmv"],
};

// Opciones de ocrmypdf.
// --skip-text: solo hace OCR en páginas sin capa de texto.
// --output-type pdf y --rasterizer pypdfium: evitan Ghostscript, que ha tenido
// vulnerabilidades al procesar PDFs maliciosos.
export const OCR_ARGS = [
  "-l", "eng+spa",
  "--skip-text",
  "--output-type", "pdf",
  "--rasterizer", "pypdfium",
  "--optimize", "0",
  "--quiet",
];

// Límite de tamaño descomprimido del ZIP (protección contra zip bombs).
export const MAX_UNZIPPED_BYTES = 10 * 1024 ** 3; // 10 GB

// Idioma de los registros de Pagefind. Un solo idioma para todo el índice:
// Pagefind separa el índice por idioma y cada búsqueda consulta solo uno.
export const INDEX_LANGUAGE = "en";
