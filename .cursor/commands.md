# Cursor: рекомендуемые команды и сценарии

---

## `docs/data-structures.md`

```markdown
# Структуры данных IWDC

Этот документ описывает ключевые сущности data-layer и их поля.

## 1. Серия (Series)

Пример (`data/json/series/vk.json`):

```json
{
  "series": "VK",
  "slug": "vk",
  "title": "Внутрипольные конвекторы ВК",
  "description": "Конвекторы для систем водяного отопления...",
  "order": 1,
  "locale": "ru",
  "models": [
    "vk.65.160.2tg",
    "vk.65.200.2tg"
  ],
  "meta": {
    "build_date": "2025-11-17T10:00:00Z",
    "source_version": "price-vitron-2025-01"
  }
}
# Cursor: рекомендуемые команды и сценарии

## Основные npm-скрипты (планируемые)

- `npm run iwdc:build` → `node tools/cli/iwdc-build.mjs`
- `npm run iwdc:validate` → `node tools/cli/iwdc-validate.mjs`
- `npm run iwdc:diff` → `node tools/cli/iwdc-diff.mjs`

## Сценарий разработки

1. Изучить соответствующий документ в `docs/`.
2. Внести изменения в схемы/документацию при необходимости.
3. Реализовать/обновить скрипты в `scripts/`.
4. Обновить CLI, если нужно.
5. Обновить `roadmap.md`, если меняется этап/версия.

Cursor должен придерживаться этого порядка, помогая писать код и поддерживая структуру проекта.
