// Misma normalización que el índice (scripts/lib/common.mjs).
export function normalize(s) {
  return s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

// Normaliza carácter por carácter y guarda, para cada carácter normalizado,
// su posición en el texto original. Sirve para encontrar coincidencias en el
// texto normalizado y resaltarlas en el texto original (con acentos).
export function normalizeWithMap(original) {
  let norm = "";
  const map = [];
  for (let i = 0; i < original.length; ) {
    const ch = String.fromCodePoint(original.codePointAt(i));
    const n = normalize(ch);
    for (let k = 0; k < n.length; k++) map.push(i);
    norm += n;
    i += ch.length;
  }
  map.push(original.length);
  return { norm, map };
}

// Palabras de una consulta ya normalizada.
export function queryWords(q) {
  return normalize(q).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}
