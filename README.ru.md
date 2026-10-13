# SEskill

Agent Skill, который превращает проект в компактную визуальную схему: создаёт JSON для SEditor и HTML-ярлык рядом. Ярлык открывается в браузере без сервера.

[English README](README.md) · [SEditor](https://github.com/Fluttershy174PUNK/SEditor)

## Установка

Установить репозиторий в pi:

```bash
pi install git:github.com/Fluttershy174PUNK/SEskill
```

Для других инструментов, совместимых с Agent Skills, скопируйте только `skills/seditor/` в каталог навыков. Имя папки должно остаться `seditor`.

Затем попросите агента создать схему, например:

```text
/seditor нарисуй поток авторизации
/seditor создай карту экранов оформления заказа
```

Навык изучит проект и создаст `.SEditor/<type>-<topic>.json` и HTML-ярлык с таким же именем. Откройте HTML, чтобы редактировать диаграмму.

## Формат и совместимость

Навык создаёт компактный JSON SEditor v1. Старые схемы без версии и v1 поддерживаются; неизвестные будущие версии нельзя понижать. Значения по умолчанию и вычисляемые геометрические поля опускаются. См. каноническое [описание формата](skills/seditor/references/schema-format.md).

## Проверка

```bash
node skills/seditor/scripts/validate-scheme.mjs .SEditor/*.json
bash verify.sh
```

`verify.sh` проверяет пакет навыка, контрольные суммы и синхронизацию рантайма, ярлыки, backend, схемы и механические eval-сценарии. Нужен соседний checkout SEditor либо переменная `SEDITOR_ROOT` с его путём.

## Лицензия

MIT — см. [LICENSE](LICENSE).
