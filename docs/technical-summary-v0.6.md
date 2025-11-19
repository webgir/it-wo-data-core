# Техническое резюме IWDC v0.6

Краткое описание ключевых механизмов для подготовки к IWDC v0.7.

---

## 1. Как строятся снимки версий (`snapshot-version.mjs`)

### Процесс создания снимка

1. **Генерация ID версии**:
   - Если версия не указана, генерируется автоматически: `YYYYMMDD-HHMMSS` (timestamp)
   - Формат: `20250115-143022`

2. **Копирование данных**:
   - Рекурсивное копирование `data/json/` → `data/versions/{version}/`
   - Сохраняется полная структура директорий (series, models, lengths, seo, meta)

3. **Поиск источника**:
   - Сканирование `sources/xls/` на наличие XLS/XLSX файлов
   - Вычисление SHA256 хэша первого найденного файла
   - Сохранение относительного пути к источнику

4. **Создание meta.json**:
   - Структура:
     ```json
     {
       "version": "20250115-143022",
       "date": "2025-01-15T14:30:22.000Z",
       "xlsHash": "sha256:abc123...",
       "sourcePath": "sources/xls/price-vitron.xlsx"
     }
     ```
   - Сохраняется в `data/versions/{version}/meta.json`

5. **Получение последней версии** (`getLatestVersion()`):
   - Сканирование `data/versions/`
   - Загрузка всех `meta.json`
   - Сортировка по дате (новые первыми)
   - Возврат версии с самой поздней датой

### Ключевые особенности

- **Идемпотентность**: можно создать снимок с явным ID версии
- **Трассируемость**: каждый снимок содержит хэш источника и дату
- **Структура**: полная копия `data/json/` сохраняется как есть

---

## 2. Как работает diff и сравнение версий (`diff.mjs`)

### Процесс сравнения

1. **Загрузка версий**:
   - Использует `loadPreviousSnapshot(version)` из utils
   - Загружает данные в формате: `{ series: {}, models: {}, lengths: {} }`
   - Каждая категория — объект `{ id: data }`

2. **Сравнение по категориям**:
   - Для каждой категории (series, models, lengths):
     - Собираются все ID из обеих версий
     - Для каждого ID определяется статус:
       - **added**: есть в `toVersion`, нет в `fromVersion`
       - **removed**: есть в `fromVersion`, нет в `toVersion`
       - **changed**: есть в обеих, но содержимое отличается (глубокое сравнение через `JSON.stringify`)

3. **Формирование diff**:
   ```javascript
   {
     meta: {
       fromVersion: "v1",
       toVersion: "v2",
       generatedAt: "2025-01-15T14:30:22.000Z"
     },
     summary: {
       series: { added: 2, removed: 0, changed: 1 },
       models: { added: 5, removed: 1, changed: 3 },
       lengths: { added: 10, removed: 2, changed: 5 }
     },
     series: {
       added: [...],
       removed: [...],
       changed: [{ from: {...}, to: {...} }]
     },
     models: { ... },
     lengths: { ... }
   }
   ```

4. **Сохранение diff**:
   - Путь: `data/diffs/{fromVersion}__{toVersion}.diff.json`
   - Использует `writeJsonFile()` из utils

### Ключевые особенности

- **Глубокое сравнение**: через `JSON.stringify` (может быть медленным для больших объектов)
- **Полные объекты**: в `added`/`removed` сохраняются полные объекты, в `changed` — пары `{from, to}`
- **Summary**: быстрая статистика без загрузки полных данных

---

## 3. Как работает bc-validator (`bc-validator.mjs`)

### Процесс валидации обратной совместимости

1. **Загрузка данных**:
   - Текущие данные: `loadJsonMap(paths.getDataJsonPath(category))` → `Map<id, data>`
   - Предыдущие данные: из `data/versions/{lastVersion}/json/{category}` → `Map<id, data>`
   - Если предыдущей версии нет → возвращает `status: "ok"`

2. **Сравнение сущностей** (для каждой категории):

   **A) Удалённые сущности**:
   - Если ID есть в `previousMap`, но нет в `currentMap` → `REMOVED_ENTITY` (error)

   **B) Изменение ID**:
   - Сравнение по `slug` (или `entity_slug`)
   - Если `slug` совпадает, но `id` отличается → `CHANGED_ID` (error)

   **C) Изменение типов полей**:
   - Для каждого поля сравнивается `typeof`
   - Специальная обработка: `null`/`undefined`, массивы, объекты
   - Если тип изменился → `TYPE_CHANGED` (error)

   **D) Удаление обязательных полей**:
   - Если поле было в `previousItem`, но отсутствует в `currentItem` → `REMOVED_REQUIRED_FIELD` (error)
   - Исключения: `meta`, `updated_at`, `data_version` (служебные поля)

3. **Статистика**:
   - `added`: новые сущности (есть в current, нет в previous)
   - `removed`: удалённые сущности (error)
   - `changed`: изменённые сущности (есть в обеих, но отличаются)

4. **Результат**:
   ```javascript
   {
     scope: "bc-validator",
     status: "error" | "ok",
     errors: [
       { type: "REMOVED_ENTITY", entity: "series", id: "series.vk" },
       { type: "CHANGED_ID", oldId: "...", newId: "...", slug: "..." },
       { type: "TYPE_CHANGED", id: "...", field: "...", oldType: "...", newType: "..." },
       { type: "REMOVED_REQUIRED_FIELD", id: "...", field: "...", entity: "..." }
     ],
     warnings: [],
     stats: { added: 5, removed: 2, changed: 10 }
   }
   ```

### Ключевые особенности

- **Строгая проверка**: любое breaking-изменение → `status: "error"`
- **Сравнение по slug**: позволяет обнаружить изменение ID при сохранении slug
- **Игнорирование служебных полей**: `meta`, `updated_at`, `data_version` не проверяются

---

## 4. Как работает iwdc-build (`iwdc-build.mjs`)

### Пайплайн сборки

**Последовательность этапов**:
```
validate → audit → integrity → snapshot → diff → semver → changelog → отчёт
```

### Детальное описание этапов

#### Шаг 1: Валидация данных
- Вызов `testData()` из `scripts/test-data.mjs`
- Проверка JSON Schema, дубликатов, значений
- При ошибках → `process.exit(1)`

#### Шаг 2: Content Audit Layer
- Запуск всех аудитов через `runAllAudits()`:
  - `validate-contracts` — JSON Schema валидация
  - `audit-structure` — проверка связей и уникальности
  - `audit-seo` — проверка SEO-полей
  - `bc-validator` — проверка обратной совместимости
- При любом `status: "error"` → `process.exit(1)`

#### Шаг 2.5: Integrity Check (перед snapshot)
- Загрузка предыдущего integrity: `loadIntegrityFromVersion(previousVersion)`
- Вычисление текущих хэшей: `calculateHashes(paths.getDataJsonPath())`
- Проверка: `checkIntegrity(previousIntegrity, currentHashes, {})`
- Обнаружение "тихих" изменений (файл изменился, но не в diff)
- При ошибках → `process.exit(1)`

#### Шаг 3: Создание снимка версии
- Вызов `snapshotVersion()` (автогенерация ID версии)
- Результат: `{ version, path, meta }`

#### Шаг 4: Сравнение версий и создание diff
- Если есть `previousVersion` и она отличается от `currentVersion`:
  - Вызов `buildDataDiff({ fromVersion, toVersion })`
  - Сохранение: `saveDataDiff(diff)`
  - Результат сохраняется в `results.diff`

#### Шаг 4.5: Data SemVer Analysis
- Нормализация diff: `normalizeDiffForSemver(diff)` → формат для `dataSemver`
- Анализ: `dataSemver(semverDiff, currentDataVersion)`
- Определение уровня версии:
  - **MAJOR**: удаление сущностей, изменение ID/типов
  - **MINOR**: добавление новых сущностей
  - **PATCH**: изменения данных без структурных изменений
- Результат: `{ level, reasons, recommendedVersion }`

#### Шаг 5: Генерация changelog
- Вызов `updateChangelogFromDiff(diff)`
- Генерация Markdown и JSON changelog

#### Шаг 6: Итоговый отчёт
- Вывод статистики по всем этапам
- Отображение результатов валидации, аудитов, integrity, diff, semver

### Ключевые особенности

- **Строгий принцип**: любая ошибка на любом этапе → остановка сборки
- **Детерминированность**: все этапы выполняются последовательно
- **Трассируемость**: каждый этап логируется через `logger.mjs`
- **Результаты**: объект `results` содержит результаты всех этапов

### Структура результатов

```javascript
{
  validation: { ... },
  audit: [ { scope, status, errors, warnings, stats }, ... ],
  integrity: { status, silent?, message? },
  snapshot: { version, path, meta },
  diff: { fromVersion, toVersion, diff, diffPath },
  semver: { level, reasons, recommendedVersion },
  changelog: { path, version }
}
```

---

## Общие архитектурные принципы

1. **Централизация путей**: все пути через `utils/paths.mjs`
2. **Единое логирование**: все логи через `utils/logger.mjs`
3. **Утилиты для файлов**: `utils/file.mjs` для загрузки/сохранения
4. **Модульность**: каждый этап — отдельный модуль с чётким интерфейсом
5. **Обратная совместимость**: все изменения должны проходить bc-validator

---

## Точки расширения для v0.7

1. **Интеграция diff в integrity check**: передача реального diff вместо `{}`
2. **Расширение data-semver**: использование `changedIds` и `changedTypes` из bc-validator
3. **Оптимизация глубокого сравнения**: замена `JSON.stringify` на более эффективный алгоритм
4. **Кэширование**: кэширование загруженных версий для ускорения diff
5. **Параллелизация**: параллельное выполнение независимых аудитов


