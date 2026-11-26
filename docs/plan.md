# Plan por fases: buscador privado de los "USAID Files"

Fecha: 2026-11-25. Estado: **aprobado** (2026-11-25).

## Decisiones tomadas (2026-11-25)

- **Privacidad:** al máximo posible. Lo que no se pueda proteger se explica con avisos muy visibles en la app, no en letra chica.
- **Idiomas:** la app va en español e inglés (cambio de idioma en la interfaz). Esta decisión amplía la fase 5.
- **Hosting:** Vercel queda en duda por el peso del índice. Se decide al terminar la fase 3, con los tamaños reales.
- **ZIP:** se descarga a `data/raw/` (unas 5 horas). Viene con `SHA256SUMS.txt` para verificar la integridad antes de descomprimir.

## Estado actual del entorno

- Carpeta del proyecto vacía (solo `docs/`). No es repositorio git. Aún no está el ZIP.
- Disponibles: Node 22, npm 10, `pdftotext`/`pdfinfo` (poppler), `qpdf`, Python 3.
- **Faltan:** `ocrmypdf`, `tesseract` (+ idioma `spa`) y `xlsx2csv`.

## Fase 0: base del proyecto

- `git init`, `.gitignore` (`data/raw/`, `data/text/`, `data/ocr/`, `node_modules/`, `dist/`).
- `package.json` con Vue 3, Vite, `@vitejs/plugin-vue`, `pagefind` y Bootstrap 5 (solo CSS).
- Scripts npm: `extract`, `index`, `verify`, `dev`, `build`.
- Herramientas del sistema (con tu OK): `brew install ocrmypdf tesseract-lang` y `pipx install xlsx2csv`.

**Cómo probar:** `npm install && npm run dev` muestra una página vacía.

## Fase 1: datos crudos y manifiesto

- ZIP en `data/raw/`, descomprimido en su propia carpeta y tratado como no confiable (solo lectura).
- `scripts/manifest.mjs` genera `data/manifest.json`: id, archivo, título, páginas (`pdfinfo`), tipo, `ocr` (se llena en la fase 2), URL original y URL de archive.org (`https://web.archive.org/web/2026/<url original>`).
- Los videos se listan con `tipo: "video"` y `indexado: false`.
- Si el patrón de URL original no sale del ZIP o de la página de USAID, te pregunto.

**Cómo probar:** `npm run manifest` y luego revisar `data/manifest.json` (248 entradas).

## Fase 2: extracción

- `scripts/extract.mjs` (Node que llama a las herramientas de línea de comandos con `execFile`, sin shell, con tiempo límite por archivo):
  - `pdftotext -layout -f N -l N`: un `.txt` por página en `data/text/<id>/p0001.txt`.
  - Detección de escaneo: páginas con menos de ~20 caracteres útiles. Si un PDF tiene páginas así, se pasa por `ocrmypdf -l eng+spa --skip-text --output-type pdf --rasterizer pypdfium` a `data/ocr/` y se vuelve a extraer. Con `--output-type pdf` y `pypdfium` se evita Ghostscript, que ha tenido vulnerabilidades al procesar PDFs maliciosos.
  - Hojas de cálculo: `xlsx2csv` (todas las hojas) a `data/text/<id>/rows.jsonl`, una fila por línea con sus encabezados (`{hoja, fila, celdas: {Encabezado: valor}}`).
  - Se registran los errores por archivo sin detener el proceso.

**Cómo probar:** `npm run extract` y luego comparar unas páginas de `data/text/` contra los PDFs.

## Fase 3: índice Pagefind

- `scripts/index.mjs`: `createIndex` → `addCustomRecord` por página o fila → `writeFiles` en `public/pagefind/`.
  - `content`: texto normalizado (minúsculas y sin diacríticos).
  - `meta`: `titulo`, `doc`, `pagina` o `fila`, `url`, `archivo` y `texto` (el texto original de la página, sin normalizar).
  - Propongo guardar **la página original completa** en `texto` para recortar el fragmento alrededor de la coincidencia real. Pagefind solo descarga ese texto para los resultados que se muestran.
  - Un solo idioma para todos los registros: Pagefind separa el índice por idioma y una búsqueda solo usa uno. Lo verifico en esta fase.
- El manifiesto no se publica: las URLs viajan en el `meta` de cada resultado, así no existe un listado navegable.

**Cómo probar:** `npm run index` y luego revisar el tamaño de `public/pagefind/`.

## Fase 4: verificación del pipeline

- `scripts/verify.mjs`: documentos totales por tipo, páginas indexadas, páginas vacías (por documento), documentos con OCR, archivos que fallaron y documentos sin indexar con su motivo (por ejemplo, "video, fuera de alcance").
- La salida se imprime en consola y además se guarda en `data/verificacion.md`.

**Cómo probar:** `npm run verify`. Ningún documento debe quedar sin indexar sin explicación.

## Fase 5: app Vue

- Carga de Pagefind en runtime con `import(/* @vite-ignore */ "/pagefind/pagefind.js")`.
- Lista de variantes (agregar y quitar). "Buscar" lanza una búsqueda por variante normalizada y fusiona los resultados por `doc+página`, con etiquetas de las variantes que coincidieron.
- Resultado: título, página o fila, fragmento con resaltado sobre el texto original (con un mapeo de posiciones entre el texto normalizado y el original), enlace al original y enlace a archive.org (`rel="noopener noreferrer"`, `target="_blank"`).
- Sin autocompletado (`autocomplete="off"`), sin listados ni rankings. Sin persistencia por defecto.
- Textos de privacidad, de límites ("no aparecer no garantiza…") y un placeholder de "qué hacer si apareces".
- Bootstrap solo CSS (sin su JS), tipografía del sistema (sin archivos de fuente) e íconos como SVG inline. Nada de terceros.
- **Bilingüe (es/en):** diccionario propio en `src/i18n.js`, sin dependencias. El idioma inicial sale del navegador y el selector no persiste (ni cookies ni localStorage).
  - Cuidado técnico: Pagefind elige su índice según el `lang` del `<html>`. Cambiar el idioma de la interfaz no debe cambiar el índice que se consulta.
- **Avisos de riesgo:** los riesgos que no se puedan eliminar (por ejemplo, los metadatos de las peticiones si no se precarga el índice) van en un aviso destacado arriba del buscador, no en letra chica.

**Cómo probar:** `npm run dev` y buscar en el celular con DevTools en modo responsive.

## Fase 6: headers, build y aceptación

- `vercel.json` con CSP, `Referrer-Policy`, `Permissions-Policy` y `nosniff`:
  - `script-src 'self' 'wasm-unsafe-eval'`: Pagefind compila su motor WebAssembly en el navegador, y sin esto la CSP lo bloquea. No habilita `eval` de JavaScript.
  - Además: `style-src 'self'`, `font-src 'self'`, `form-action 'none'`.
- Lista de pruebas de aceptación: build sin red externa, panel Network, acentos y término en un PDF escaneado.

**Cómo probar:** `npm run build && npx vite preview` (o `vercel dev`) y revisar los headers y el panel Network.

## Riesgo de privacidad a decidir: metadatos de las peticiones

El término nunca viaja en ninguna petición. Pero Pagefind descarga **bajo demanda**:

1. el fragmento del índice que corresponde al rango alfabético del término, y
2. un archivo por cada resultado mostrado.

Quien vea los logs del servidor (Vercel u otro intermediario) puede deducir **qué páginas aparecieron como resultado** y, con eso, aproximar qué se buscó. Para personas defensoras esto puede importar.

Opciones:

- **A.** Aceptarlo y explicarlo en la sección de privacidad.
- **B.** Precargar todo el índice y todos los fragmentos al abrir la página, para que las peticiones no dependan de la búsqueda. El costo es descargar varios MB al inicio; la cifra exacta se sabe al terminar la fase 3.

Recomendación: decidir con el tamaño real del índice al terminar la fase 3.

## Avance (2026-11-25)

Hecho y probado con datos de prueba ficticios (PDF con texto, PDF escaneado, xlsx y video vacío):

- **Fase 0:** proyecto, dependencias y herramientas del sistema (ocrmypdf 17.14, Tesseract eng+spa, xlsx2csv 0.8.6).
- **Fases 1 a 4:** `unpack`, `manifest`, `extract`, `index` y `verify`.
  - `unpack` verifica que el archivo sea un ZIP real; rechaza el HTML de Cloudflare.
  - `unpack` rechaza rutas peligrosas, enlaces simbólicos y zip bombs, y quita los permisos de ejecución.
- **Fase 5:** app bilingüe con búsqueda por variantes, resaltado sobre el texto original y avisos de privacidad y riesgo.
- **Fase 6 (parcial):** `vercel.json` con los headers. `vite preview` aplica los mismos headers para probar en local.

Hallazgo importante: Pagefind es tolerante. Ignora las palabras que no encuentra y hace coincidencias aproximadas, lo que da falsos positivos. Se corrigió así:
- Y lógico por palabra en el navegador.
- Verificación estricta en el texto de cada candidato (`src/match.js`).
- Las coincidencias "frase exacta" y "palabras separadas" se marcan distinto en la interfaz.

Prueba E2E con Chrome headless (script en el scratchpad de la sesión):
- Ninguna petición contiene el término.
- Ninguna petición sale de localhost.
- No hay errores de CSP ni de consola.
- Con y sin acentos dan los mismos resultados.
- El término del PDF escaneado se encuentra.

Pendiente:
- Descargar el ZIP real desde el navegador. La primera descarga guardó la página anti-bots de Cloudflare.
- Confirmar el patrón de URL original (`scripts/config.mjs`).
- Correr el pipeline con los datos reales y revisar el reporte de verificación.
- Decidir la precarga del índice (opción B) y el hosting con los tamaños reales.
- Definir el enlace de "qué hacer si apareces".

## Decisiones (2026-11-25, segunda ronda)

- Se muestran también las coincidencias de **palabras separadas** (etiqueta gris), además de la frase exacta (azul).
- Los enlaces a PDF llevan `#page=N`. El fragmento no se envía al servidor.
- La prueba E2E queda en el proyecto (`scripts/test/`):
  - `npm run test:fixtures`: pipeline completo con datos ficticios en `data/e2e/` más la prueba E2E. No toca `data/` ni `public/pagefind`.
  - `npm run test:e2e`: prueba el `dist/` actual con `data/e2e-cases.json`. Ese archivo está en `.gitignore` porque tendrá términos reales.

## Propuesta pendiente: filtro por país

- La especificación prohíbe los listados navegables de países. Por eso, la versión compatible sería un filtro **opcional** que solo acota una búsqueda por variante, escrito a mano y sin lista desplegable.
- Depende de cómo vengan los datos: las hojas probablemente traen una columna de país; en los PDFs habría que deducirlo del texto, y eso es poco confiable.
- Se decide después de ver el ZIP.

## Datos reales (2026-11-25)

- ZIP real: 1,078.6 MB y 248 archivos (242 PDF, 3 xlsx, 3 mp4). SHA-256 `69a7f85d2acb1ec26613734c61017d5f7c22ae2b50959288914a20630390c55c`. El `SHA256SUMS.txt` que había era el hash de la página de Cloudflare; el ZIP no trae uno propio.
- URL original: `https://www.usaid.gov/files/<archivo>`, confirmada con un enlace real.
- Títulos: se derivan del nombre del archivo, sin el hash final y con espacios en vez de guiones.
- Extracción: 2,160 páginas de PDF; 126 PDFs pasaron por OCR; 0 errores.
- Índice: 2,353 registros (2,135 páginas y 218 filas). Ocupa 6.0 MB en 2,487 archivos: 2.7 MB de índice y 3.4 MB de fragmentos, ya comprimidos.
- Páginas que se indexan: toda página con al menos una letra o número. Antes el umbral era de 20 caracteres y dejaba fuera diapositivas con solo el nombre de un país. El umbral de 20 solo decide cuándo aplicar OCR.
- Páginas vacías: 25. Están en blanco o totalmente tachadas, salvo una diapositiva ("NEPAL", texto blanco sobre rojo) que el OCR no leyó.
- Hojas de cálculo: no traen una columna de país. Solo "Regional/local vs. global effort" lo menciona a veces en texto libre.
- Prueba E2E con términos públicos: sin fugas del término, sin peticiones externas y sin errores de CSP. Cada búsqueda hace entre 46 y 124 peticiones de fragmentos al servidor.

## Decisiones (2026-11-25, tercera ronda)

- **Opción A** para el riesgo de metadatos: no se precarga el índice, para que la página sea más ligera. El aviso amarillo se queda como está.
- **Hosting: Vercel.** `.vercelignore` impide subir `data/`, `docs/` y `scripts/`. Sin Analytics ni Speed Insights.
- **Filtro "También menciona (opcional)":** un campo de texto libre (sin lista de países). Solo quedan las páginas o filas donde aparecen la variante y el filtro, verificado en el texto. El filtro se resalta en azul. Además reduce las peticiones por búsqueda, porque descarga menos fragmentos.
- La prueba E2E soporta `"tambien"` en los casos. La detección de fugas ahora compara palabras completas, porque "meta" daba falso positivo dentro del nombre de archivo `…pf_meta`.
