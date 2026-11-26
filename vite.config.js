import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// `vite preview` aplica los mismos headers que vercel.json, para probar la CSP
// en local. (En `vite dev` no se aplican: Vite inyecta estilos en línea.)
const vercel = JSON.parse(readFileSync(new URL("./vercel.json", import.meta.url), "utf8"));
const previewHeaders = Object.fromEntries(
  vercel.headers.find((h) => h.source === "/(.*)").headers.map(({ key, value }) => [key, value]),
);

export default defineConfig({
  plugins: [vue()],
  build: {
    sourcemap: false,
  },
  preview: {
    headers: previewHeaders,
  },
});
