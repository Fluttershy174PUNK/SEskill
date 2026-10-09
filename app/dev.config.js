import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Режим разработки: живая перезагрузка через dev-сервер Vite.
// Тот же шаблон src/editor.html, но со ссылками на /src/* — сборка
// (app/vite.config.js) превращает его в один самодостаточный app/editor.html.
const backend = `http://localhost:${process.env.PORT || 5174}`;
// root = src/, поэтому путь к конфигу Svelte задаём абсолютным.
const svelteConfig = fileURLToPath(new URL('./svelte.config.js', import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL('../src', import.meta.url)),
  plugins: [svelte({ configFile: svelteConfig })],
  server: {
    port: 5173,
    proxy: { '/api': backend }
  }
});
