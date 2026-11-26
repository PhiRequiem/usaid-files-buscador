// Textos de la interfaz en español e inglés. Sin dependencias.
// El idioma inicial sale del navegador; el cambio no se guarda en ningún lado
// (ni cookies ni localStorage).

import { ref } from "vue";

const messages = {
  es: {
    langName: "Español",
    docTitle: "Buscador privado de los USAID Files",
    title: "¿Apareces en los USAID Files?",
    subtitle:
      "Busca de forma privada si tu organización, tu medio o tu nombre aparece en los 248 archivos que USAID publicó el 24 de noviembre de 2026.",

    privacyTitle: "Tu búsqueda no sale de tu navegador",
    privacy1: "Lo que escribes se busca dentro de tu propio navegador. No se envía a ningún servidor ni se registra.",
    privacy2: "Este sitio no usa cookies, analítica, rastreadores ni servicios de terceros.",
    privacy3: "Nada se guarda: al cerrar la pestaña, la búsqueda desaparece y no queda en el historial.",

    riskTitle: "Lo que este sitio no puede ocultar",
    risk1:
      "Para mostrarte resultados, tu navegador descarga del servidor algunas partes del índice y el texto de las páginas que coinciden. El servidor no ve lo que escribiste, pero quien tenga acceso a sus registros podría deducir aproximadamente qué páginas te interesaron.",
    risk2: "Tu proveedor de internet o la red que usas pueden ver que visitaste este sitio, aunque no lo que buscaste.",
    risk3: "Al abrir un documento original, usaid.gov o archive.org verán qué documento abres.",
    risk4: "Si tu situación es de alto riesgo, usa una conexión de confianza (no la de tu trabajo) y un dispositivo que solo tú controles.",

    formTitle: "Busca una o varias variantes",
    formHelp:
      "Agrega cada forma en que podrías aparecer: nombre completo, siglas, dominio web, número de award, nombre de una persona. Cada variante se busca por separado. Mayúsculas y acentos dan igual.",
    inputLabel: "Variante",
    inputPlaceholder: "Ej.: Fundación Ejemplo, FUNDEJ, fundej.org",
    add: "Agregar",
    remove: "Quitar",
    variantsLabel: "Variantes a buscar",
    alsoLabel: "También menciona (opcional)",
    alsoHelp: "Solo muestra las páginas o filas que además mencionan esto, por ejemplo un país o una ciudad. Se busca igual que una variante y tampoco sale de tu navegador.",
    alsoPlaceholder: "Ej.: Guatemala",
    search: "Buscar",
    searching: "Buscando…",
    loadingIndex: "Cargando el buscador…",
    loadError:
      "No se pudo cargar el buscador. Puede que tu navegador bloquee WebAssembly (por ejemplo, en modos de seguridad estrictos). Prueba con otro navegador.",

    resultsCount: (n) => (n === 1 ? "1 página o fila con coincidencias" : `${n} páginas o filas con coincidencias`),
    alsoActive: (a) => `que también mencionan «${a}»`,
    noResults: "No encontramos coincidencias para estas variantes.",
    noResultsNote: "Esto no garantiza que no aparezcas. Revisa los límites abajo y prueba otras variantes.",
    matched: "Coincide con",
    page: (n) => `Página ${n}`,
    row: (sheet, n) => `Hoja «${sheet}», fila ${n}`,
    openOriginal: "Ver original en usaid.gov",
    openArchive: "Ver respaldo en archive.org",
    linkPending: "Enlace pendiente",
    newTab: "(se abre en una pestaña nueva)",
    showMore: "Mostrar más resultados",
    checking: (d, n) => `Revisando ${d} de ${n} páginas candidatas…`,
    wordsApart: "(palabras separadas)",

    limitsTitle: "Que no aparezcas no garantiza que no estés",
    limits1: "Muchos documentos son escaneos. El reconocimiento de texto (OCR) comete errores, sobre todo con mala calidad de imagen.",
    limits2: "Algunos nombres y correos están tachados. Lo tachado no se puede buscar.",
    limits3: "Tu nombre puede aparecer escrito de otra forma: con errores, abreviado, traducido o sin acentos. Prueba varias variantes.",
    limits4: "Los 3 videos no están indexados.",

    whatTitle: "¿Qué hacer si apareces?",
    whatBody: "Estamos preparando una guía de recursos de respuesta.",
    whatLink: "Recursos de respuesta (próximamente)",

    footer:
      "Fuente: archivos publicados por USAID.gov el 24 de noviembre de 2026. Este sitio no aloja los documentos; enlaza a usaid.gov y a su respaldo en archive.org.",
  },

  en: {
    langName: "English",
    docTitle: "Private search of the USAID Files",
    title: "Are you in the USAID Files?",
    subtitle:
      "Privately check whether your organization, outlet or name appears in the 248 files USAID released on November 24, 2026.",

    privacyTitle: "Your search never leaves your browser",
    privacy1: "What you type is searched inside your own browser. It is not sent to any server and it is not logged.",
    privacy2: "This site uses no cookies, analytics, trackers or third-party services.",
    privacy3: "Nothing is saved: when you close the tab, the search is gone and it does not stay in your history.",

    riskTitle: "What this site cannot hide",
    risk1:
      "To show results, your browser downloads parts of the index and the text of matching pages from the server. The server does not see what you typed, but anyone with access to its logs could roughly infer which pages you were interested in.",
    risk2: "Your internet provider or the network you use can see that you visited this site, but not what you searched for.",
    risk3: "When you open an original document, usaid.gov or archive.org will see which document you open.",
    risk4: "If you are at high risk, use a trusted connection (not your workplace's) and a device only you control.",

    formTitle: "Search one or more variants",
    formHelp:
      "Add every way you might appear: full name, acronym, web domain, award number, a person's name. Each variant is searched separately. Case and accents don't matter.",
    inputLabel: "Variant",
    inputPlaceholder: "E.g.: Example Foundation, FUNDEJ, fundej.org",
    add: "Add",
    remove: "Remove",
    variantsLabel: "Variants to search",
    alsoLabel: "Also mentions (optional)",
    alsoHelp: "Only show pages or rows that also mention this, for example a country or a city. It is searched like a variant and it does not leave your browser either.",
    alsoPlaceholder: "E.g.: Guatemala",
    search: "Search",
    searching: "Searching…",
    loadingIndex: "Loading search…",
    loadError:
      "The search could not load. Your browser may be blocking WebAssembly (for example, in strict security modes). Try another browser.",

    resultsCount: (n) => (n === 1 ? "1 matching page or row" : `${n} matching pages or rows`),
    alsoActive: (a) => `that also mention “${a}”`,
    noResults: "No matches found for these variants.",
    noResultsNote: "This does not guarantee you are not mentioned. See the limits below and try other variants.",
    matched: "Matches",
    page: (n) => `Page ${n}`,
    row: (sheet, n) => `Sheet “${sheet}”, row ${n}`,
    openOriginal: "View original on usaid.gov",
    openArchive: "View backup on archive.org",
    linkPending: "Link pending",
    newTab: "(opens in a new tab)",
    showMore: "Show more results",
    checking: (d, n) => `Checking ${d} of ${n} candidate pages…`,
    wordsApart: "(words apart)",

    limitsTitle: "Not finding yourself does not mean you are not there",
    limits1: "Many documents are scans. Text recognition (OCR) makes mistakes, especially with poor image quality.",
    limits2: "Some names and emails are redacted. Redacted text cannot be searched.",
    limits3: "Your name may be written differently: misspelled, abbreviated, translated or without accents. Try several variants.",
    limits4: "The 3 videos are not indexed.",

    whatTitle: "What to do if you appear",
    whatBody: "We are preparing a guide to response resources.",
    whatLink: "Response resources (coming soon)",

    footer:
      "Source: files released by USAID.gov on November 24, 2026. This site does not host the documents; it links to usaid.gov and its backup on archive.org.",
  },
};

function initialLang() {
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language || "es"];
  for (const l of langs) {
    const base = String(l).toLowerCase().split("-")[0];
    if (base === "es") return "es";
    if (base === "en") return "en";
  }
  return "es";
}

export const lang = ref(initialLang());
export const LANGS = Object.keys(messages);

export function setLang(l) {
  lang.value = l;
  document.documentElement.lang = l;
  document.title = t("docTitle");
}

export function t(key, ...args) {
  const v = messages[lang.value][key] ?? messages.es[key] ?? key;
  return typeof v === "function" ? v(...args) : v;
}

export function langName(l) {
  return messages[l].langName;
}
