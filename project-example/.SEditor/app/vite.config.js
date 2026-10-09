import { svelte } from '@sveltejs/vite-plugin-svelte';
import { rename, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// SEditor собирается в ОДИН самодостаточный editor.html: весь CSS и JS внутри него.
// Готовую страницу можно просто открыть в браузере (file://) или положить на статику.
//
// Конфиг живёт в app/, исходники — в ../src/. Сборка идёт во временную папку
// app/.build/, затем готовый файл переносится в app/editor.html. Напрямую писать
// в app/ нельзя: Vite принял бы шаблон за выходной файл и затёр его.
const APP = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(APP, '..');

export default defineConfig({
  root: ROOT,
  plugins: [
    svelte({ configFile: join(APP, 'svelte.config.js') }),
    {
      name: 'seditor-single-file',
      enforce: 'post',
      generateBundle(_options, bundle) {
        const html = Object.values(bundle).find((f) => f.fileName.endsWith('.html'));
        if (!html) return;

        const js = Object.values(bundle).filter((f) => f.type === 'chunk');
        const css = Object.values(bundle).filter((f) => f.fileName.endsWith('.css'));

        // Внутри <script> последовательность </script> должна быть экранирована.
        const code = js.map((c) => c.code).join('\n').replaceAll('</script', '<\\/script');
        const style = css.map((c) => String(c.source)).join('\n');

        // 1) Чистим шаблон от ссылок Vite — делаем это до вставки кода,
        //    иначе regex может зацепить строки внутри бандла.
        //    Внешние стили (Google Fonts) оставляем — они идут с CDN и не мешают file://.
        let out = String(html.source)
          .replace(/<script\b[^>]*\bsrc="[^"]*"[^>]*>\s*<\/script>\s*/gi, '')
          .replace(/<link\b[^>]*>/gi, (tag) => (/rel="stylesheet"/.test(tag) && !/href="https?:/.test(tag) ? '' : tag));

        // 2) Вставляем только в ПОСЛЕДНИЕ </head> и </body>.
        const headAt = out.lastIndexOf('</head>');
        out = out.slice(0, headAt) + (style ? `  <style>${style}</style>\n` : '') + out.slice(headAt);
        const bodyAt = out.lastIndexOf('</body>');
        out = out.slice(0, bodyAt) + `  <script type="module">${code}</script>\n` + out.slice(bodyAt);

        html.source = out;

        // Метка для тех, кто открыл готовый файл: править нужно исходники.
        html.source = String(html.source).replace(
          /<!doctype html>/i,
          '<!doctype html>\n<!-- Сгенерировано сборкой SEditor — не редактировать. Исходники: src/, сборка: app/ -->'
        );

        for (const file of [...js, ...css]) delete bundle[file.fileName];
      },
      async closeBundle() {
        // Vite сохраняет структуру входа: шаблон лежит как app/.build/src/editor.html.
        await rename(join(APP, '.build/src/editor.html'), join(APP, 'editor.html'));
        await rm(join(APP, '.build'), { recursive: true, force: true });
      }
    }
  ],
  publicDir: false,
  build: {
    outDir: join(APP, '.build'),
    emptyOutDir: true,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    cssCodeSplit: false,
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: 'src/editor.html',
      output: {
        // Всё сводим в один бандл, чтобы склеить его прямо в html.
        codeSplitting: false,
        entryFileNames: 'app.js',
        assetFileNames: 'app[extname]'
      }
    }
  }
});
