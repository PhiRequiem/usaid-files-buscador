// Comprobación estricta de coincidencias sobre el texto normalizado.
// Pagefind solo propone candidatos (es tolerante: ignora palabras que no
// encuentra y hace coincidencias aproximadas). Aquí se confirma que la
// variante de verdad está en la página antes de mostrarla.

import { queryWords } from "./normalize.js";

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Apariciones de una palabra al inicio de palabra; la marca se extiende hasta
// el final de la palabra ("organization" → "organizations"). Si no aparece y
// la palabra es larga, prueba quitando hasta 3 letras finales, para cubrir
// plurales y formas cercanas ("organizations" → "organization").
export function wordHits(norm, w) {
  const tries = [w];
  if (w.length >= 6) for (let cut = 1; cut <= 3 && w.length - cut >= 5; cut++) tries.push(w.slice(0, -cut));
  for (const stem of tries) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(stem)}[\\p{L}\\p{N}]*`, "gu");
    const hits = [...norm.matchAll(re)].map((m) => ({ start: m.index, end: m.index + m[0].length }));
    if (hits.length) return hits;
  }
  return [];
}

// Apariciones de la variante como frase (palabras contiguas separadas por
// espacios o signos: "Ana Pérez", "ejemplo-ficticio.org").
export function phraseHits(norm, words) {
  const re = new RegExp(
    `(?<![\\p{L}\\p{N}])${words.map(escapeRe).join("[^\\p{L}\\p{N}]+")}(?![\\p{L}\\p{N}])`,
    "gu",
  );
  return [...norm.matchAll(re)].map((m) => ({ start: m.index, end: m.index + m[0].length }));
}

// ¿La variante está en el texto? exact = como frase; si no, todas sus
// palabras en la misma página.
export function matchVariant(norm, variant) {
  const words = queryWords(variant);
  if (!words.length) return null;
  const phrase = phraseHits(norm, words);
  if (phrase.length) return { exact: true, hits: phrase.map((h) => ({ ...h, key: variant })) };
  const hits = [];
  for (const w of words) {
    const h = wordHits(norm, w);
    if (!h.length) return null;
    hits.push(...h.map((x) => ({ ...x, key: w })));
  }
  return { exact: words.length === 1, hits };
}
