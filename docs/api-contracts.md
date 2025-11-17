# API Contracts

---

## `docs/pipeline.md`

```markdown
# Пайплайн IWDC (XLS → CSV → JSON → Validation → Diff)

Этот документ описывает общий процесс обработки данных в IWDC.

## 1. Общий сценарий

1. Получить или обновить исходный XLS/XLSX в `sources/xls/`.
2. Запустить конвейер:
   - `scripts/xls-to-csv.mjs`
   - `scripts/csv-to-json.mjs`
   - `scripts/validate.mjs`
3. При необходимости:
   - `scripts/diff.mjs`
   - `scripts/changelog.mjs`
4. Использовать обновлённый `data/json` в клиентах (сайты, API).

## 2. Этап 1: XLS → CSV

- Вход:
  - `sources/xls/*.xlsx`
- Выход:
  - `intermediate/csv/models.csv`
  - `intermediate/csv/lengths.csv`
  - `intermediate/csv/seo.csv`
  - `intermediate/csv/texts.csv`
- Конфигурация:
  - описана в `docs/xls-mapping.md`.

## 3. Этап 2: CSV → JSON

- Вход:
  - CSV-файлы из `intermediate/csv/`.
- Выход:
  - `data/json/series/*.json`
  - `data/json/models/*.json`
  - `data/json/lengths/*/*.json`
- Правила маппинга:
  - описаны в `docs/csv-json.md`.

## 4. Этап 3: Валидация

- Вход:
  - все JSON-файлы из `data/json/`.
- Инструменты:
  - JSON Schema (`schemas/*.schema.json`).
  - Доменные проверки (диапазоны, связность, статусы).
- Результат:
  - exit code 0 — всё корректно.
  - exit code != 0 — выявлены ошибки, билд останавливается.

Подробнее в `docs/validation.md`.

## 5. Этап 4: Diff и Changelog

- Сравнение текущего JSON-слоя с предыдущей версией.
- Генерация:
  - машинного diff (для CI/логов).
  - человекочитаемого changelog (для команды/клиентов).
- Форматы описаны в `docs/diff-changelog.md`.

## 6. Интеграция с CI/CD

- Пайплайн IWDC может запускаться:
  - перед сборкой сайтов.
  - в отдельном репозитории для периодических обновлений.
- Минимальный сценарий:
  - `iwdc-build.mjs` → `iwdc-validate.mjs` → деплой клиентов.

Подробности интеграции зависят от окружения и описываются в CI-конфиге конкретного проекта.
