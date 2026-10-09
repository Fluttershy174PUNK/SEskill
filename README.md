<div align="center">

# SEskill — `/seditor`

**Агентный навык: превращает любой проект в визуальные схемы, которые человек открывает
и правит в [SEditor](https://github.com/Fluttershy174PUNK/SEditor).**

Агент пишет JSON-схему → вы открываете её двойным кликом и редактируете визуально.

<img alt="Agent Skills" src="https://img.shields.io/badge/Agent%20Skills-compatible-6f42c1?style=flat-square">
<img alt="Node.js 18+" src="https://img.shields.io/badge/node-%E2%89%A518-3c873a?style=flat-square">
<img alt="runtime dependencies: 0" src="https://img.shields.io/badge/runtime%20dependencies-0-2ea44f?style=flat-square">
<img alt="schema v1" src="https://img.shields.io/badge/schema-v1-0366d6?style=flat-square">
<img alt="launcher embed-v1" src="https://img.shields.io/badge/launcher-embed--v1-6f42c1?style=flat-square">
<img alt="license MIT" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square">

</div>

---

## Что это

Навык для агентных харнессов (**pi**, Claude Code, Codex, opencode). По запросу он
исследует репозиторий, пишет корректную схему SEditor v1 в `.SEditor/` и кладёт рядом
HTML-ярлык, который открывает её в редакторе.

```text
ваш-проект/
└── .SEditor/
    ├── app/                     # управляемый рантайм редактора (копия SEditor)
    │   ├── editor.html
    │   ├── server.js
    │   ├── create-shortcut.mjs
    │   ├── launcher.js
    │   └── shortcut.html
    ├── logic-auth-flow.json     # схема, которую пишет агент
    └── logic-auth-flow.html     # ярлык: двойной клик → редактор
```

Схемы бывают разных типов — `logic-*`, `code-*`, `designer-*`, `data-*`, `deployment-*`:

| Тип | Для чего | Пример |
| --- | --- | --- |
| `logic` | бизнес-логика, потоки, состояния | `logic-auth-flow` |
| `code` | модули, API-контракты, потоки данных | `code-module-map` |
| `designer` | экраны, компоненты, навигация | `designer-screen-map` |
| `data` | сущности БД и связи | `data-model` |
| `deployment` | инфраструктура, сервисы | `deployment-topology` |
| `custom` | всё остальное | задаёт пользователь |

---

## Установка

Пакет навыка — это `skills/seditor/` (там лежит `SKILL.md`), остальное в репозитории —
тесты, примеры и документация сопровождения.

```bash
# pi — пакет клонируется целиком, skills/ обнаруживается сам
pi install git:github.com/Fluttershy174PUNK/SEskill

# любой другой харнесс (Claude Code, Codex, opencode) — копируем только пакет
	git clone https://github.com/Fluttershy174PUNK/SEskill /tmp/seditor
	cp -a /tmp/seditor/skills/seditor .agents/skills/seditor
```

> Папка **обязана** называться `seditor` — так требует frontmatter `SKILL.md`.

Перезапустите агента и попросите схему:

```text
/seditor map sign-in and password reset
/seditor нарисуй карту экранов и переходов
```

---

## Как открыть результат

**Двойной клик по `.SEditor/<slug>.html`.** Сервер не нужен: ярлык несёт данные схемы
внутри себя и открывает редактор напрямую через `file://`.

> **Почему данные внутри.** Браузер на `file://` запрещает читать соседний JSON
> (`fetch`, XHR и `import()` блокируются). Поэтому ярлык хранит копию схемы и передаёт её
> редактору через hash. Следствие: **после правки JSON ярлык нужно перегенерировать** —
> навык делает это последним шагом каждой правки.

### Опциональный backend

Расширенный режим добавляет список последних схем, запись JSON/PNG сразу на диск и кнопку
создания ярлыка в редакторе:

```bash
node .SEditor/app/server.js    # → http://127.0.0.1:5174/editor.html
```

Без него редактор тоже умеет сохранять JSON и PNG — в папку, выбранную один раз
(File System Access API). Держите `HOST` на `127.0.0.1`: файловый API пишет по любым путям.

---

## Состав репозитория

```text
skills/seditor/              ← ПАКЕТ НАВЫКА: всё, что устанавливается
  SKILL.md                   инструкции и workflow (единственная точка входа агента)
  LICENSE
  references/schema-format.md точный формат SEditor v1 и подводные камни
  scripts/                   только то, что вызывает агент: sync-editor,
                             create-shortcut, validate-scheme
  assets/example-scheme.*    эталонный пример схемы и ярлыка
  app/                       вендор SEditor: 5 файлов рантайма + version.json

tests/                       проверки репозитория (не устанавливаются)
  *.test.mjs                 unit/E2E: синхронизация, ярлыки, backend, структура
  validate-skill.mjs         структурная валидация пакета
  run-evals.mjs, grade-evals.mjs  механические eval-сценарии
  evals/                     промпты для оценки качества и триггеров
examples/auth-tasks/         проект-пример: src/ + сгенерированный .SEditor/
docs/
  vendoring.md               процедура обновления вендорного редактора
  brief.md                   исходное ТЗ проекта
verify.sh                    всё вышеперечисленное одной командой
```

`app/` — это **вендорная копия** редактора: те же 5 файлов, что лежат в `SEditor/app/`
(конфигов сборки и тестов там нет — копировать их незачем). Версии и контрольные суммы
закреплены в `app/version.json`; `docs/vendoring.md` описывает процедуру обновления.

---

## Проверка

```bash
bash verify.sh
```

Что проверяется:

- Формат Agent Skills (`skills-ref validate` через `uvx`).
- Контрольные суммы и паритет вендорного рантайма с исходным репозиторием SEditor.
- Валидатор схем: валидные, невалидные, битые и отсутствующие входы.
- Файловые тесты: синхронизация версий, сохранность пользовательских файлов, подмена бандла.
- **Комплексный E2E** (`tests/system.test.mjs`): round-trip данных ярлыка,
  экранирование инъекций, глубокие пути со спецсимволами, HTTP-API и защита от обхода ROOT,
  паритет генераторов, обнаружение устаревших ярлыков.
- Прогон eval-сценариев в изолированных временных проектах.

Тесты выполняют скрипты и файлы навыка напрямую. **Они не запускают LLM** и не оценивают
смысловую точность схем — для этого нужен прогон в чистом контексте агента
(см. `tests/evals/README.md`).

### Eval-сценарии

```bash
node tests/run-evals.mjs                                  # механические проверки
node tests/grade-evals.mjs <run-dir>                      # оценка вывода реального агента
```

`tests/evals/evals.json` — 8 сценариев с промптами и ожидаемыми результатами.
`tests/evals/eval_queries.json` — позитивные и near-miss запросы для проверки срабатывания триггера.
Срабатывание зависит от модели и клиента: детерминированные тесты не могут утверждать,
что навык вызвался.

---

## Требования

- Node.js ≥ 18 (для встроенного backend редактора).
- Современный браузер с File System Access API (Chrome, Edge) для сохранения без сервера.
  В Firefox/Safari работает скачивание и backend-режим.

---

## Лицензия

MIT — см. [LICENSE](LICENSE).
