// Renders embedded-schema portable HTML exports and legacy file:// launchers without runtime dependencies.

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
export function renderStandaloneEditor(source, schema) {
  const moduleScript = /<script type="module">/;
  if (!source.includes('</body>') || !moduleScript.test(source) || !(source.match(/<script type="module">/g) || []).length) {
    throw new Error('editor HTML must contain a bundled module script');
  }
  const data = inScript(JSON.stringify(schema));
  const embedded = `<script type="application/json" id="seditor-schema">${data}</script><script id="seditor-bootstrap">window.__SEDITOR_INITIAL_SCHEMA__=JSON.parse(document.getElementById('seditor-schema').textContent);document.getElementById('seditor-schema').remove();</script>`;
  return source.replace(moduleScript, `${embedded}<script type="module">`);
}

export function renderLauncher(template, { schema, name, editorUrl, schemaPathParam, editorSha, serverCommand }) {
  const data = inScript(JSON.stringify(schema));
  return template
    .replaceAll('__SCHEME_NAME__', escapeHtml(name))
    .replaceAll('__SCHEME_PATH__', escapeHtml(decodeURIComponent(schemaPathParam)))
    .replaceAll('__SCHEME_PATH_PARAM__', inScript(JSON.stringify(schemaPathParam)))
    .replaceAll('__SCHEME_JSON__', data)
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
