// Чистый рендер HTML-ярлыка: одна реализация для Node (create-shortcut.mjs)
// и для браузера (редактор перегенерирует ярлык при сохранении).
// Никаких зависимостей от node:* — файл входит в автономную папку app/.
//
// Ярлык несёт данные схемы внутри себя и редиректит в общий app/editor.html:
// так схема открывается двойным кликом (file://) без локального сервера.

// Внутри <script> последовательность "<" закрывает элемент, поэтому в JSON
// её всегда пишем как \u003c — JSON.parse вернёт исходный символ.
export const inScript = (text) => String(text).replace(/</g, '\\u003c');

export const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Относительный путь в вид для URL: по сегментам, чтобы пробелы и юникод кодировались, а "/" оставался. */
export const urlPath = (relative) =>
  String(relative)
    .split(/[\\/]/)
    .filter((part) => part !== '' && part !== '.')
    .map(encodeURIComponent)
    .join('/');

/** Подставить данные в шаблон app/shortcut.html. */
export function renderLauncher(template, { schema, name, editorUrl, schemaPathParam, editorSha, serverCommand }) {
  return template
    .replaceAll('__SCHEME_NAME__', escapeHtml(name))
    .replaceAll('__SCHEME_PATH__', escapeHtml(decodeURIComponent(schemaPathParam)))
    .replaceAll('__SCHEME_PATH_PARAM__', inScript(JSON.stringify(schemaPathParam)))
    .replaceAll('__SCHEME_JSON__', inScript(JSON.stringify(schema)))
    .replaceAll('__EDITOR_URL__', inScript(JSON.stringify(editorUrl)))
    .replaceAll('__EDITOR_REL__', escapeHtml(decodeURIComponent(editorUrl)))
    .replaceAll('__EDITOR_SHA256__', escapeHtml(editorSha))
    .replaceAll('__SERVER_COMMAND__', escapeHtml(serverCommand));
}

/**
 * Относительный путь between двумя наборами сегментов (posix, без ведущего "../").
 * Браузерный эквивалент path.relative: нужен, чтобы перегенерировать ярлык из редактора.
 */
export function relativePath(fromSegments, toSegments) {
  let same = 0;
  while (same < fromSegments.length && same < toSegments.length && fromSegments[same] === toSegments[same]) same += 1;
  const up = fromSegments.length - same;
  const down = toSegments.slice(same);
  return [...Array(up).fill('..'), ...down].join('/');
}

/** Разбить относительный posix-путь на сегменты, схлопнув "." и внутренние "..". */
export function pathSegments(relative) {
  const out = [];
  for (const part of String(relative).split('/')) {
    if (!part || part === '.') continue;
    if (part === '..' && out.length && out[out.length - 1] !== '..') out.pop();
    else out.push(part);
  }
  return out;
}
