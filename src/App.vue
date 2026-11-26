<script setup>
import { ref, computed, onMounted, nextTick } from "vue";
import { t, lang, LANGS, setLang, langName } from "./i18n.js";
import { loadPagefind, searchVariants } from "./search.js";

const PAGE_SIZE = 20;

const input = ref("");
const inputEl = ref(null);
const variants = ref([]);
const also = ref(""); // filtro opcional "también menciona"
const alsoUsed = ref(""); // el filtro con el que se hizo la última búsqueda

const status = ref("idle"); // idle | loading | ready | error
const searching = ref(false);
const searched = ref(false);
const results = ref([]); // resultados confirmados
const visible = ref(PAGE_SIZE);
const progress = ref(null); // { done, total } mientras se revisan candidatos
let searchId = 0;

const shown = computed(() => results.value.slice(0, visible.value));
const hasMore = computed(() => visible.value < results.value.length);

onMounted(async () => {
  setLang(lang.value);
  // Cargar Pagefind al abrir no depende de lo que se busque.
  status.value = "loading";
  try {
    await loadPagefind();
    status.value = "ready";
  } catch (e) {
    console.error(e);
    status.value = "error";
  }
});

function addVariant() {
  const v = input.value.trim().replace(/\s+/g, " ");
  if (v && !variants.value.some((x) => x.toLowerCase() === v.toLowerCase())) {
    variants.value.push(v);
  }
  input.value = "";
}

function removeVariant(i) {
  variants.value.splice(i, 1);
  nextTick(() => inputEl.value?.focus());
}

async function runSearch() {
  addVariant();
  if (!variants.value.length || status.value !== "ready") return;
  const id = ++searchId;
  searching.value = true;
  progress.value = null;
  try {
    const alsoNow = also.value.trim().replace(/\s+/g, " ");
    const res = await searchVariants([...variants.value], alsoNow, (done, total) => {
      if (id === searchId) progress.value = { done, total };
    });
    if (id !== searchId) return;
    results.value = res;
    alsoUsed.value = alsoNow;
    visible.value = PAGE_SIZE;
    searched.value = true;
  } finally {
    if (id === searchId) {
      searching.value = false;
      progress.value = null;
    }
  }
}

function showMore() {
  visible.value += PAGE_SIZE;
}

function location(r) {
  if (r.pagina) return t("page", r.pagina);
  if (r.fila) return t("row", r.hoja, r.fila);
  return "";
}
</script>

<template>
  <div class="app" :data-status="status" :data-searching="searching" :data-searched="searched">
    <header class="border-bottom bg-body-tertiary">
      <div class="container py-3 d-flex flex-wrap gap-2 align-items-start justify-content-between">
        <div class="me-3">
          <h1 class="h3 mb-1">{{ t("title") }}</h1>
          <p class="mb-0 text-body-secondary">{{ t("subtitle") }}</p>
        </div>
        <div class="btn-group btn-group-sm" role="group" aria-label="Idioma / Language">
          <button
            v-for="l in LANGS"
            :key="l"
            type="button"
            class="btn"
            :class="l === lang ? 'btn-dark' : 'btn-outline-dark'"
            :aria-pressed="l === lang"
            :lang="l"
            @click="setLang(l)"
          >
            {{ langName(l) }}
          </button>
        </div>
      </div>
    </header>

    <main class="container py-4">
      <div class="row g-3 mb-4">
        <section class="col-lg-6" aria-labelledby="privacy-title">
          <div class="card h-100 border-success">
            <div class="card-body">
              <h2 id="privacy-title" class="h5 text-success-emphasis">
                <svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 1a3 3 0 0 0-3 3v2H4a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-1V4a3 3 0 0 0-3-3Zm-2 5V4a2 2 0 1 1 4 0v2H6Z"/></svg>
                {{ t("privacyTitle") }}
              </h2>
              <ul class="mb-0">
                <li>{{ t("privacy1") }}</li>
                <li>{{ t("privacy2") }}</li>
                <li>{{ t("privacy3") }}</li>
              </ul>
            </div>
          </div>
        </section>

        <section class="col-lg-6" aria-labelledby="risk-title">
          <div class="card h-100 border-warning border-2 risk">
            <div class="card-body">
              <h2 id="risk-title" class="h5">
                <svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M7.13 1.5a1 1 0 0 1 1.74 0l6.5 11.5A1 1 0 0 1 14.5 14.5h-13a1 1 0 0 1-.87-1.5l6.5-11.5ZM8 5a.75.75 0 0 0-.75.75v3.5a.75.75 0 0 0 1.5 0v-3.5A.75.75 0 0 0 8 5Zm0 7a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"/></svg>
                {{ t("riskTitle") }}
              </h2>
              <ul class="mb-0">
                <li>{{ t("risk1") }}</li>
                <li>{{ t("risk2") }}</li>
                <li>{{ t("risk3") }}</li>
                <li><strong>{{ t("risk4") }}</strong></li>
              </ul>
            </div>
          </div>
        </section>
      </div>

      <section class="card mb-4" aria-labelledby="form-title">
        <div class="card-body">
          <h2 id="form-title" class="h5">{{ t("formTitle") }}</h2>
          <p id="form-help" class="text-body-secondary">{{ t("formHelp") }}</p>

          <form @submit.prevent="runSearch" autocomplete="off">
            <label for="variant" class="form-label fw-semibold">{{ t("inputLabel") }}</label>
            <div class="input-group mb-3">
              <input
                id="variant"
                ref="inputEl"
                v-model="input"
                type="text"
                class="form-control form-control-lg"
                :placeholder="t('inputPlaceholder')"
                aria-describedby="form-help"
                autocomplete="off"
                autocorrect="off"
                autocapitalize="off"
                spellcheck="false"
                maxlength="200"
              />
              <button type="button" class="btn btn-outline-secondary" @click="addVariant">
                {{ t("add") }}
              </button>
            </div>

            <div v-if="variants.length" class="mb-3">
              <div class="small fw-semibold mb-1" id="variants-label">{{ t("variantsLabel") }}</div>
              <ul class="list-unstyled d-flex flex-wrap gap-2 mb-0" aria-labelledby="variants-label">
                <li v-for="(v, i) in variants" :key="v" class="badge text-bg-light border variant">
                  <span>{{ v }}</span>
                  <button
                    type="button"
                    class="btn-close btn-sm ms-1"
                    :aria-label="`${t('remove')}: ${v}`"
                    @click="removeVariant(i)"
                  ></button>
                </li>
              </ul>
            </div>

            <label for="also" class="form-label fw-semibold">{{ t("alsoLabel") }}</label>
            <p id="also-help" class="form-text mt-0 mb-2">{{ t("alsoHelp") }}</p>
            <input
              id="also"
              v-model="also"
              type="text"
              class="form-control mb-3 also-input"
              :placeholder="t('alsoPlaceholder')"
              aria-describedby="also-help"
              autocomplete="off"
              autocorrect="off"
              autocapitalize="off"
              spellcheck="false"
              maxlength="200"
            />

            <button
              type="submit"
              class="btn btn-primary btn-lg"
              :disabled="status !== 'ready' || searching || (!variants.length && !input.trim())"
            >
              {{ searching ? t("searching") : t("search") }}
            </button>
            <span v-if="status === 'loading'" class="ms-3 text-body-secondary">{{ t("loadingIndex") }}</span>
            <span v-if="progress" class="ms-3 text-body-secondary">{{ t("checking", progress.done, progress.total) }}</span>
          </form>

          <div v-if="status === 'error'" class="alert alert-danger mt-3 mb-0" role="alert">
            {{ t("loadError") }}
          </div>
        </div>
      </section>

      <section aria-live="polite" class="mb-4">
        <template v-if="searched && !searching">
          <template v-if="results.length">
            <h2 class="h5 mb-3">
              {{ t("resultsCount", results.length) }}
              <template v-if="alsoUsed"> <mark class="alt">{{ t("alsoActive", alsoUsed) }}</mark></template>
            </h2>
            <ol class="list-unstyled">
              <li v-for="r in shown" :key="r.id" class="card mb-3">
                <div class="card-body">
                  <h3 class="h6 mb-1 text-break">{{ r.titulo }}</h3>
                  <div class="small text-body-secondary mb-2">
                    {{ location(r) }}
                    <span class="text-break"> · {{ r.archivo }}</span>
                  </div>
                  <div class="mb-2 small">
                    {{ t("matched") }}:
                    <span v-for="v in r.variants" :key="v.text" class="badge me-1" :class="v.exact ? 'text-bg-primary' : 'text-bg-secondary'"
                      >{{ v.exact ? v.text : `${v.text} ${t("wordsApart")}` }}</span
                    >
                  </div>
                  <p class="excerpt mb-3">
                    <template v-for="(s, i) in r.excerpt" :key="i"
                      ><mark v-if="s.mark" :class="{ alt: s.mark === 'alt' }">{{ s.text }}</mark><template v-else>{{ s.text }}</template></template
                    >
                  </p>
                  <div class="d-flex flex-wrap gap-2">
                    <a
                      v-if="r.urlOriginal"
                      :href="r.urlOriginal"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="btn btn-sm btn-outline-primary"
                      >{{ t("openOriginal") }} ↗<span class="visually-hidden"> {{ t("newTab") }}</span></a
                    >
                    <a
                      v-if="r.urlArchivo"
                      :href="r.urlArchivo"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="btn btn-sm btn-outline-secondary"
                      >{{ t("openArchive") }} ↗<span class="visually-hidden"> {{ t("newTab") }}</span></a
                    >
                    <span v-if="!r.urlOriginal" class="small text-body-secondary">{{ t("linkPending") }}</span>
                  </div>
                </div>
              </li>
            </ol>
            <button v-if="hasMore" type="button" class="btn btn-outline-primary" @click="showMore">
              {{ t("showMore") }}
            </button>
          </template>
          <div v-else class="alert alert-secondary">
            <strong>{{ t("noResults") }}</strong>
            {{ t("noResultsNote") }}
          </div>
        </template>
      </section>

      <div class="row g-3">
        <section class="col-lg-6" aria-labelledby="limits-title">
          <div class="card h-100">
            <div class="card-body">
              <h2 id="limits-title" class="h5">{{ t("limitsTitle") }}</h2>
              <ul class="mb-0">
                <li>{{ t("limits1") }}</li>
                <li>{{ t("limits2") }}</li>
                <li>{{ t("limits3") }}</li>
                <li>{{ t("limits4") }}</li>
              </ul>
            </div>
          </div>
        </section>
        <section class="col-lg-6" aria-labelledby="what-title">
          <div class="card h-100">
            <div class="card-body">
              <h2 id="what-title" class="h5">{{ t("whatTitle") }}</h2>
              <p>{{ t("whatBody") }}</p>
              <!-- PENDIENTE: enlace a recursos de respuesta -->
              <a href="#" class="disabled-link" aria-disabled="true">{{ t("whatLink") }}</a>
            </div>
          </div>
        </section>
      </div>
    </main>

    <footer class="border-top py-3 mt-4">
      <div class="container small text-body-secondary">{{ t("footer") }}</div>
    </footer>
  </div>
</template>

<style scoped>
.icon {
  width: 1em;
  height: 1em;
  vertical-align: -0.125em;
  margin-right: 0.25rem;
}
.risk {
  background: var(--bs-warning-bg-subtle);
}
.variant {
  display: inline-flex;
  align-items: center;
  font-size: 0.95rem;
  font-weight: 500;
  white-space: normal;
  text-align: left;
}
.excerpt {
  font-family: var(--bs-font-monospace);
  font-size: 0.875rem;
  background: var(--bs-tertiary-bg);
  padding: 0.75rem;
  border-radius: var(--bs-border-radius);
  overflow-wrap: anywhere;
}
.excerpt mark {
  padding: 0 0.1em;
  background: #ffe066;
  color: inherit;
  font-weight: 600;
}
mark.alt,
.excerpt mark.alt {
  background: #cfe2ff;
  color: inherit;
}
.also-input {
  max-width: 24rem;
}
.disabled-link {
  pointer-events: none;
  color: var(--bs-secondary-color);
}
</style>
