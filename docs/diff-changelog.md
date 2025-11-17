# Diff и Changelog в IWDC

Система сравнения версий данных и генерации changelog для отслеживания изменений в каталоге.

## 1. Версия данных

**Версия данных** — снимок состояния `data/json/` на определённый момент времени.

Каждая версия сохраняется в `data/versions/<version>/` и содержит:
- Полную копию `data/json/` (series, models, lengths)
- Файл `meta.json` с метаданными версии

**Формат `meta.json`:**
```json
{
  "version": "1.2.0",
  "date": "2025-01-01T12:00:00.000Z",
  "xlsHash": "abc123def456...",
  "sourcePath": "sources/xls/price-vitron.xlsx"
}
```

## 2. Снятие снапшота

Создаёт снимок текущего состояния `data/json/` в `data/versions/<version>/`.

**Команда:**
```bash
npm run data:snapshot -- 1.2.0
```

Если версия не указана, генерируется автоматически (формат: `YYYYMMDD-HHMMSS`).

**Что делает:**
1. Копирует `data/json/` → `data/versions/<version>/`
2. Находит XLS файлы в `sources/xls/`
3. Вычисляет SHA256 хэш первого найденного XLS файла
4. Создаёт `meta.json` с метаданными

## 3. Запуск diff

Сравнивает две версии данных и генерирует diff.

**Команда:**
```bash
node tools/cli/iwdc-diff.mjs --from <ver> --to <ver> [--with-changelog]
```

**Параметры:**
- `--from <ver>` — версия "от" (если не указана, используется последняя)
- `--to <ver>` — версия "до" (обязательный)
- `--with-changelog` — обновить changelog после создания diff

**Пример:**
```bash
node tools/cli/iwdc-diff.mjs --from 1.1.0 --to 1.2.0 --with-changelog
```

## 4. Структура JSON-diff

Файл сохраняется в `data/diffs/<fromVersion>__<toVersion>.diff.json`.

**Формат:**
```json
{
  "meta": {
    "fromVersion": "1.1.0",
    "toVersion": "1.2.0",
    "generatedAt": "2025-01-01T12:00:00.000Z"
  },
  "summary": {
    "series": { "added": 0, "removed": 0, "changed": 0 },
    "models": { "added": 5, "removed": 2, "changed": 10 },
    "lengths": { "added": 20, "removed": 5, "changed": 15 }
  },
  "series": {
    "added": [],
    "removed": [],
    "changed": []
  },
  "models": {
    "added": [{ ... }],
    "removed": [{ ... }],
    "changed": [{ "from": {...}, "to": {...} }]
  },
  "lengths": {
    "added": [{ ... }],
    "removed": [{ ... }],
    "changed": [{ "from": {...}, "to": {...} }]
  }
}
```

**Правила:**
- `added` — массив объектов, присутствующих только в новой версии
- `removed` — массив объектов, присутствующих только в старой версии
- `changed` — массив объектов `{ from, to }`, где содержимое отличается
- Сравнение по ID: `slug` для models/lengths, `series` для series
- Глубокое сравнение JSON-объектов

## 5. Структура changelog

Changelog сохраняется в `data/changelog/data-changelog.md`.

**Формат блока версии:**
```markdown
## 1.2.0 — 1 января 2025

**Источники:** перенос из 1.1.0
**Общее:** добавлено: 25, удалено: 7, изменено: 25

### Добавлено

- models: `vk-70-200-4к`
- lengths: `vk-70-200-800-4к`

### Изменено

- models: `vk-65-160-2г`
- lengths: `vk-65-160-600-2г`

### Удалено

- models: `vk-55-160-2г`

---
```

**Правила:**
- Новые версии добавляются в начало файла
- Формат: `## <version> — <date>`
- Секции выводятся только если есть изменения
- ID объектов берутся из `slug` или `model_code`/`series`

## 6. Примеры команд

### Полный цикл работы с версиями

```bash
# 1. Создать снапшот версии 1.1.0
npm run data:snapshot -- 1.1.0

# 2. Внести изменения в данные...

# 3. Создать снапшот версии 1.2.0
npm run data:snapshot -- 1.2.0

# 4. Сравнить версии и создать changelog
node tools/cli/iwdc-diff.mjs --from 1.1.0 --to 1.2.0 --with-changelog
```

### Сравнение с последней версией

```bash
# Автоматически использует последнюю версию как --from
node tools/cli/iwdc-diff.mjs --to 1.2.0
```

### Только diff без changelog

```bash
node tools/cli/iwdc-diff.mjs --from 1.1.0 --to 1.2.0
```

## 7. Выходные данные

После выполнения diff выводится:

```
============================================================
IWDC DIFF READY
============================================================
from: 1.1.0
to: 1.2.0
added/removed/changed — 25/7/25
file: data/diffs/1.1.0__1.2.0.diff.json
============================================================
```
