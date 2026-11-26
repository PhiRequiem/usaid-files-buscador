// Búsqueda 100% en el navegador con Pagefind.
// El término nunca sale del navegador: Pagefind descarga archivos del índice
// (con nombres por hash) y fragmentos de resultados, nunca la consulta.
//
// Flujo por variante:
// 1. Pagefind busca cada palabra por separado y se intersectan los resultados
//    (Y lógico: Pagefind por sí solo ignora las palabras que no encuentra).
// 2. Se descargan los candidatos y se confirma en su texto que la variante
//    está de verdad (src/match.js). Solo esos se muestran.
//
// Filtro opcional "también menciona" (p. ej. un país): se busca igual que una
// variante y solo quedan las páginas o filas donde están la variante Y el
// filtro. Se escribe a mano: no hay listados de países ni de nada.

import { normalizeWithMap, queryWords } from "./normalize.js";
import { matchVariant } from "./match.js";

let pagefindPromise = null;

export function loadPagefind() {
  if (!pagefindPromise) {
    pagefindPromise = (async () => {
      const pf = await import(/* @vite-ignore */ "/pagefind/pagefind.js");
      await pf.options({ basePath: "/pagefind/" });
      await pf.init();
      return pf;
    })();
    pagefindPromise.catch(() => (pagefindPromise = null));
  }
  return pagefindPromise;
}

async function candidatesFor(pf, words, cache) {
  let ids = null;
  for (const w of words) {
    if (!cache.has(w)) {
      const res = await pf.search(w);
      cache.set(w, new Map((res?.results || []).map((r) => [r.id, r])));
    }
    const found = cache.get(w);
    ids = ids ? new Map([...ids].filter(([id]) => found.has(id))) : new Map(found);
    if (!ids.size) break;
  }
  return ids || new Map();
}

const CONCURRENCY = 8;

// Devuelve los resultados confirmados, ya con sus datos cargados.
export async function searchVariants(variants, also = "", onProgress = () => {}) {
  const pf = await loadPagefind();
  const cache = new Map();
  const candidates = new Map(); // id -> { result, variants: [] }

  const alsoWords = queryWords(also);
  const alsoIds = alsoWords.length ? await candidatesFor(pf, alsoWords, cache) : null;
  if (alsoIds && !alsoIds.size) return [];

  for (const variant of variants) {
    const words = queryWords(variant);
    if (!words.length) continue;
    for (const [id, result] of await candidatesFor(pf, words, cache)) {
      if (alsoIds && !alsoIds.has(id)) continue;
      if (!candidates.has(id)) candidates.set(id, { result, variants: [] });
      candidates.get(id).variants.push(variant);
    }
  }

  const list = [...candidates.values()];
  const confirmed = [];
  let done = 0;
  let i = 0;
  async function worker() {
    while (i < list.length) {
      const c = list[i++];
      const data = await c.result.data();
      const texto = data.meta.texto || "";
      const { norm, map } = normalizeWithMap(texto);
      const alsoMatch = alsoIds ? matchVariant(norm, also) : null;
      const matches =
        alsoIds && !alsoMatch
          ? []
          : c.variants.map((v) => ({ variant: v, m: matchVariant(norm, v) })).filter((x) => x.m);
      if (matches.length) confirmed.push(toResult(c.result.id, data.meta, texto, norm, map, matches, alsoMatch));
      onProgress(++done, list.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, worker));

  return confirmed.sort(
    (a, b) =>
      b.variants.length - a.variants.length ||
      Number(b.exact) - Number(a.exact) ||
      a.titulo.localeCompare(b.titulo) ||
      (a.pagina ?? a.fila ?? 0) - (b.pagina ?? b.fila ?? 0),
  );
}

function toResult(id, meta, texto, norm, map, matches, alsoMatch) {
  // Las coincidencias del filtro se resaltan con otro estilo (alt).
  const alsoHits = (alsoMatch?.hits || []).map((h) => ({ ...h, key: `also:${h.key}`, alt: true }));
  return {
    id,
    variants: matches.map((x) => ({ text: x.variant, exact: x.m.exact })),
    exact: matches.some((x) => x.m.exact),
    titulo: meta.titulo,
    archivo: meta.archivo,
    pagina: meta.pagina ? Number(meta.pagina) : null,
    hoja: meta.hoja || null,
    fila: meta.fila ? Number(meta.fila) : null,
    urlOriginal: withPage(meta.url_original, meta.pagina),
    urlArchivo: withPage(meta.url_archivo, meta.pagina),
    excerpt: buildExcerpt(texto, norm, map, [...matches.flatMap((x) => x.m.hits), ...alsoHits]),
  };
}

// Para PDFs, #page=N abre el visor directamente en la página. El fragmento
// (#...) nunca se envía al servidor.
function withPage(url, pagina) {
  if (!url) return null;
  return pagina && !url.includes("#") ? `${url}#page=${pagina}` : url;
}

const WORDCHAR = /[\p{L}\p{N}]/u;
const WINDOW = 320;

// Arma el extracto alrededor de la zona con más coincidencias distintas.
// Devuelve segmentos {text, mark} sobre el texto ORIGINAL (con acentos).
// mark: false (texto normal), true (variante) o "alt" (filtro "también menciona").
// Se renderizan como texto, nunca con v-html: los documentos no son confiables.
export function buildExcerpt(original, norm, map, hits) {
  if (!original) return [];
  hits = [...hits].sort((a, b) => a.start - b.start || b.end - a.end);

  let best = { start: 0, score: -1 };
  for (const h of hits) {
    const start = Math.max(0, h.start - 80);
    const keys = new Set(hits.filter((x) => x.start >= start && x.end <= start + WINDOW).map((x) => x.key));
    if (keys.size > best.score) best = { start, score: keys.size };
  }

  let ns = best.start;
  let ne = Math.min(norm.length, ns + WINDOW);
  while (ns > 0 && WORDCHAR.test(norm[ns - 1])) ns--;
  while (ne < norm.length && WORDCHAR.test(norm[ne])) ne++;

  const segs = [];
  let cursor = ns;
  const push = (a, b, mark) => {
    if (b <= a) return;
    const text = original.slice(map[a], map[b]).replace(/\s+/g, " ");
    if (text) segs.push({ text, mark });
  };
  for (const h of hits) {
    if (h.start < cursor || h.end > ne) continue;
    push(cursor, h.start, false);
    push(h.start, h.end, h.alt ? "alt" : true);
    cursor = h.end;
  }
  push(cursor, ne, false);
  if (ns > 0) segs.unshift({ text: "… ", mark: false });
  if (ne < norm.length) segs.push({ text: " …", mark: false });
  return segs;
}

