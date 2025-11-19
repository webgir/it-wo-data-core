# IWDC Recovery Layer (v0.7)

Recovery Layer — система защиты и восстановления данных IWDC, обеспечивающая автоматический откат при ошибках сборки, восстановление из snapshot и ремонт повреждённых данных.

---

## 1. Назначение

Recovery Layer решает следующие задачи:

### 1.1. Защита данных
- Автоматическое создание резервных копий перед критическими операциями
- Отслеживание состояния данных через `recovery-state.json`
- Фиксация последней успешной версии для быстрого восстановления

### 1.2. Автоматический откат
- При ошибке сборки автоматически откатывает `data/json/` к последней успешной версии
- Настраивается через `config/recoveryConfig.mjs` (флаг `autoRecoveryOnBuildFail`)

### 1.3. Восстановление из snapshot
- Восстановление `data/json/` из любого сохранённого snapshot версии
- Поддержка режима `dry-run` для безопасного тестирования

### 1.4. Ремонт данных
- Автоматическое обнаружение проблем (удалённые сущности, поля, несовпадения типов)
- Построение плана ремонта на основе сравнения с предыдущей версией
- Применение плана с резервным копированием

### 1.5. Режим диагностики (iwdc-doctor)
- Комплексная диагностика состояния данных
- Валидация, BC-аудит, сравнение с предыдущей версией
- Автоматическое определение возможности ремонта
- Генерация детальных отчётов

---

## 2. Архитектура

### 2.1. Ключевые модули

#### `scripts/recovery/state.mjs`
Управление состоянием Recovery системы:
- `loadRecoveryState()` — загрузка состояния из `data/state/recovery-state.json`
- `saveRecoveryState(state)` — сохранение состояния

**Структура recovery-state:**
```json
{
  "lastSuccessfulVersion": "20250115-143022",
  "lastBuild": {
    "status": "failed",
    "version": "20250115-150000",
    "reason": "Validation failed",
    "timestamp": "2025-01-15T15:00:00.000Z"
  },
  "currentDataOrigin": {
    "source": "working",
    "reference": "version:20250115-143022",
    "timestamp": "2025-01-15T14:30:22.000Z"
  }
}
```

#### `scripts/recovery/recovery-core.mjs`
Основные функции восстановления:
- `restoreFromSnapshot({ version, dryRun, backup })` — восстановление из snapshot
- `rollbackToVersion({ version, dryRun, backup })` — откат к версии

**Процесс восстановления:**
1. Проверка существования версии
2. Создание backup (если `backup=true`)
3. Удаление существующих категорий (`series/`, `models/`, `lengths/`)
4. Копирование данных из `data/versions/{version}/json/`
5. Обновление recovery state

#### `scripts/recovery/repair-strategies.mjs`
Движок ремонта данных:
- `buildRepairPlan({ currentDir, previousVersion })` — построение плана ремонта
- `applyRepairPlan(plan, { dryRun })` — применение плана

**Типы операций ремонта:**
- `restoreEntity` — восстановление удалённой сущности
- `restoreField` — восстановление удалённого поля
- `typeCoercion` — исправление несовпадения типов

#### `scripts/recovery/doctor.mjs`
Система диагностики:
- `runDoctor({ apply, autoRepair })` — комплексная диагностика

**Процесс диагностики:**
1. Загрузка последней успешной версии
2. Валидация данных (`testData()`)
3. BC-аудит (`bcValidator()`)
4. Сравнение с предыдущей версией
5. Анализ проблем и определение `canAutoRepair`
6. Построение и применение плана ремонта (опционально)

#### `tools/cli/iwdc-recovery.mjs`
CLI-интерфейс для управления Recovery:
- `status` — показать состояние recovery
- `restore <version>` — восстановить из snapshot
- `rollback [<version>]` — откатить к версии
- `doctor [--apply] [--auto-repair]` — запустить диагностику

### 2.2. Директории Recovery Layer

```
data/
  recovery/
    backups/              # Резервные копии data/json перед операциями
      <timestamp>-before-restore/
      <timestamp>-before-rollback/
      <timestamp>-before-repair/
    repair-plans/         # Планы ремонта данных
      <timestamp>-from-<version>.json
    doctor-reports/       # Отчёты диагностики
      doctor-<timestamp>.json
  logs/
    recovery/             # Логи операций recovery
      <timestamp>-repair.log
  state/
    recovery-state.json   # Состояние Recovery системы
```

### 2.3. recovery-state.json

Центральный файл состояния Recovery системы:

- **`lastSuccessfulVersion`** — последняя версия, при которой сборка прошла успешно
- **`lastBuild`** — информация о последней сборке (успешной или неудачной)
- **`currentDataOrigin`** — происхождение текущих данных:
  - `source`: `"working"` | `"version"` | `"repair"`
  - `reference`: ссылка на источник (например, `"version:20250115-143022"`)
  - `timestamp`: время последнего изменения

---

## 3. Функции Recovery Layer

### 3.1. Restore from Snapshot

**Функция:** `restoreFromSnapshot({ version, dryRun, backup })`

**Процесс:**
1. Проверка существования версии в `data/versions/{version}/json/`
2. Создание backup в `data/recovery/backups/{timestamp}-before-restore/` (если `backup=true`)
3. Удаление существующих категорий из `data/json/`:
   - `series/`
   - `models/`
   - `lengths/`
4. Копирование данных из `data/versions/{version}/json/` в `data/json/`
5. Обновление recovery state:
   - `currentDataOrigin.source = "version"`
   - `currentDataOrigin.reference = "version:{version}"`
   - `currentDataOrigin.timestamp = now`

**Использование:**
```bash
node tools/cli/iwdc-recovery.mjs restore 20250115-143022
node tools/cli/iwdc-recovery.mjs restore 20250115-143022 --dry-run
```

### 3.2. Rollback

**Функция:** `rollbackToVersion({ version, dryRun, backup })`

**Процесс:**
- Аналогичен `restoreFromSnapshot`, но:
  - Использует префикс backup `before-rollback`
  - Если версия не указана, использует `state.lastSuccessfulVersion`

**Автоматический режим:**
- При ошибке сборки и включённом `autoRecoveryOnBuildFail`:
  - Автоматически вызывается `rollbackToVersion({ version: lastSuccessfulVersion })`
  - Логируется: `[RECOVERY] Build failed → autoRollback enabled → rolling back...`

**Использование:**
```bash
node tools/cli/iwdc-recovery.mjs rollback
node tools/cli/iwdc-recovery.mjs rollback 20250115-143022 --dry-run
```

### 3.3. Repair Engine

**Функция:** `buildRepairPlan({ currentDir, previousVersion })`

**Процесс построения плана:**
1. Загрузка текущих данных из `data/json/`
2. Загрузка данных предыдущего snapshot из `data/versions/{previousVersion}/json/`
3. Сравнение и определение операций:
   - **Удалённые сущности** → `restoreEntity`
   - **Удалённые поля** → `restoreField`
   - **Несовпадение типов** → `typeCoercion`
4. Формирование плана:
   ```json
   {
     "previousVersion": "20250115-143022",
     "generatedAt": "2025-01-15T15:00:00.000Z",
     "summary": {
       "entitiesRestored": 5,
       "fieldsRestored": 12,
       "typeCorrections": 3
     },
     "operations": [...]
   }
   ```
5. Сохранение в `data/recovery/repair-plans/{timestamp}-from-{version}.json`

**Функция:** `applyRepairPlan(plan, { dryRun })`

**Процесс применения:**
1. Создание backup в `data/recovery/backups/{timestamp}-before-repair/` (если не `dryRun`)
2. Применение операций:
   - `restoreEntity` → вставка объекта целиком
   - `restoreField` → добавление отсутствующего поля
   - `typeCoercion` → преобразование типа данных
3. Сохранение обновлённых JSON в `data/json/*`
4. Обновление recovery state:
   - `currentDataOrigin.source = "repair"`
   - `currentDataOrigin.reference = plan.file`
   - `currentDataOrigin.timestamp = now`
5. Логирование в `data/logs/recovery/{timestamp}-repair.log`

### 3.4. IWDC Doctor

**Функция:** `runDoctor({ apply, autoRepair })`

**Процесс диагностики:**

1. **Получение последней успешной версии:**
   - Загрузка `recovery-state`
   - Если `lastSuccessfulVersion` отсутствует → статус `"no-successful-version"`

2. **Диагностика данных:**
   - Валидация: `testData()` → проверка JSON Schema, дубликатов, значений
   - BC-аудит: `bcValidator()` → проверка обратной совместимости
   - Сравнение: сравнение текущих данных с предыдущей версией

3. **Анализ проблем:**
   - Сводка:
     - `validation: ok | error`
     - `bcAudit: ok | error`
     - `diffStats: added/removed/changed`
   - Определение `canAutoRepair`:
     - `true`, если `bcAudit.status === "error"` ИЛИ `validation.status === "error"`
     - И есть `lastSuccessfulVersion`

4. **Построение и применение плана:**
   - Если `canAutoRepair` и (`autoRepair` или `apply`):
     - Строит план через `buildRepairPlan()`
     - При `apply=true` применяет план через `applyRepairPlan()`

5. **Сохранение отчёта:**
   - Отчёт сохраняется в `data/recovery/doctor-reports/doctor-{timestamp}.json`
   - Содержит все диагностические данные и рекомендации

**Использование:**
```bash
node tools/cli/iwdc-recovery.mjs doctor
node tools/cli/iwdc-recovery.mjs doctor --auto-repair
node tools/cli/iwdc-recovery.mjs doctor --apply
```

---

## 4. Интеграция со сборкой (iwdc-build)

Recovery Layer интегрирован в основной процесс сборки IWDC.

### 4.1. Обновление после успешной сборки

После успешного завершения всех этапов сборки:

```javascript
state.lastSuccessfulVersion = newVersion;
state.currentDataOrigin = {
  source: "working",
  reference: `version:${newVersion}`,
  timestamp: new Date().toISOString()
};
state.lastBuild = null; // Очищаем при успехе
```

**Логирование:** `[RECOVERY] Build succeeded → обновлена lastSuccessfulVersion: {version}`

### 4.2. Обработка ошибок сборки

При любой ошибке в процессе сборки:

1. **Запись ошибки в recovery state:**
   ```javascript
   state.lastBuild = {
     status: "failed",
     version: newVersionCandidate, // или null если snapshot не создан
     reason: error.message,
     timestamp: new Date().toISOString()
   };
   ```

2. **Автоматический откат (если включено):**
   - Если `recoveryConfig.autoRecoveryOnBuildFail === true`
   - И есть `state.lastSuccessfulVersion`
   - Вызывается `rollbackToVersion({ version: lastSuccessfulVersion })`

**Логирование:**
- `[RECOVERY] Build failed → записано в recovery state`
- `[RECOVERY] Build failed → autoRollback enabled → rolling back to {version}...`
- `[RECOVERY] Recovery complete → version {version}`

### 4.3. Конфигурация

Настройка в `config/recoveryConfig.mjs`:

```javascript
export const recoveryConfig = {
  autoRecoveryOnBuildFail: true  // Автоматический откат при ошибке сборки
};
```

### 4.4. Важные замечания

- **Exit code не меняется:** при ошибке сборка всё равно возвращает `exit(1)`
- **Auto-recovery не скрывает ошибки:** билд остаётся неуспешным даже после отката
- **Все ошибки обрабатываются:** даже если snapshot не был создан (`newVersionCandidate` может быть `null`)

---

## 5. CLI-интерфейс

### 5.1. `status`

Показать текущее состояние Recovery системы.

```bash
node tools/cli/iwdc-recovery.mjs status
```

**Выводит:**
- Последняя успешная версия (`lastSuccessfulVersion`)
- Информация о последней сборке (`lastBuild`)
- Текущее происхождение данных (`currentDataOrigin`)

### 5.2. `restore <version>`

Восстановить `data/json/` из snapshot версии.

```bash
node tools/cli/iwdc-recovery.mjs restore 20250115-143022
node tools/cli/iwdc-recovery.mjs restore 20250115-143022 --dry-run
```

**Параметры:**
- `<version>` — идентификатор версии для восстановления (обязательно)
- `--dry-run` — пробный запуск без применения изменений

**Процесс:**
- Создаёт backup перед восстановлением
- Копирует `series/`, `models/`, `lengths/` из snapshot
- Обновляет recovery state

### 5.3. `rollback [<version>]`

Откатить `data/json/` к версии.

```bash
node tools/cli/iwdc-recovery.mjs rollback
node tools/cli/iwdc-recovery.mjs rollback 20250115-143022 --dry-run
```

**Параметры:**
- `[<version>]` — идентификатор версии (опционально, по умолчанию используется `lastSuccessfulVersion`)
- `--dry-run` — пробный запуск без применения изменений

**Процесс:**
- Если версия не указана, использует `state.lastSuccessfulVersion`
- Создаёт backup перед откатом
- Копирует данные из snapshot
- Обновляет recovery state

### 5.4. `doctor [--apply] [--auto-repair]`

Запустить диагностику данных IWDC.

```bash
node tools/cli/iwdc-recovery.mjs doctor
node tools/cli/iwdc-recovery.mjs doctor --auto-repair
node tools/cli/iwdc-recovery.mjs doctor --apply
```

**Параметры:**
- `--auto-repair` — использовать авторемонт при обнаружении проблем (строит план, но не применяет)
- `--apply` — применить автоматический ремонт (строит и применяет план)

**Процесс:**
- Запускает валидацию, BC-аудит, сравнение с предыдущей версией
- Определяет возможность авторемонта
- Строит план ремонта (если `canAutoRepair` и флаги установлены)
- Применяет план (если `--apply`)
- Сохраняет отчёт в `data/recovery/doctor-reports/`

**Exit code:**
- `0` — doctor отработал (даже если есть ошибки в данных)
- `1` — фатальная ошибка выполнения

---

## 6. Логи и отчёты

### 6.1. Логи операций

**Директория:** `data/logs/recovery/`

**Формат файлов:** `{timestamp}-repair.log`

**Содержимое:**
- Информация о применённом плане ремонта
- Предыдущая версия
- Время применения
- Статистика операций (entitiesRestored, fieldsRestored, typeCorrections)

### 6.2. Отчёты диагностики

**Директория:** `data/recovery/doctor-reports/`

**Формат файлов:** `doctor-{timestamp}.json`

**Содержимое:**
```json
{
  "timestamp": "2025-01-15T15:00:00.000Z",
  "status": "problems-detected",
  "lastSuccessfulVersion": "20250115-143022",
  "diagnostics": {
    "validation": { "status": "error", "totalErrors": 5 },
    "bcAudit": { "status": "error", "errors": 3 },
    "diffComparison": { "status": "ok", "diffStats": {...} }
  },
  "analysis": {
    "canAutoRepair": true,
    "problems": [...],
    "recommendations": [...]
  },
  "repairPlan": { "file": "...", "summary": {...}, "operationsCount": 20 }
}
```

### 6.3. Планы ремонта

**Директория:** `data/recovery/repair-plans/`

**Формат файлов:** `{timestamp}-from-{previousVersion}.json`

**Содержимое:**
- Предыдущая версия
- Время генерации
- Сводка операций
- Список операций (restoreEntity, restoreField, typeCoercion)

---

## 7. Жизненный цикл данных Recovery Layer

### 7.1. Успешная сборка

```
build → success
  ↓
обновление lastSuccessfulVersion
  ↓
currentDataOrigin.source = "working"
currentDataOrigin.reference = "version:{newVersion}"
  ↓
recovery-state сохранён
```

### 7.2. Ошибка сборки

```
build → fail
  ↓
запись ошибки в lastBuild
  ↓
autoRecoveryOnBuildFail === true?
  ↓ (да)
rollbackToVersion({ version: lastSuccessfulVersion })
  ↓
data/json/ откачен к последней успешной версии
  ↓
recovery-state обновлён
  ↓
build всё равно завершается с exit(1)
```

### 7.3. Диагностика и ремонт

```
doctor → диагностика
  ↓
validation: error ИЛИ bcAudit: error?
  ↓ (да)
canAutoRepair = true
  ↓
buildRepairPlan({ previousVersion })
  ↓
план сохранён в repair-plans/
  ↓
--apply установлен?
  ↓ (да)
applyRepairPlan(plan)
  ↓
backup создан
  ↓
операции применены
  ↓
data/json/ обновлён
  ↓
currentDataOrigin.source = "repair"
  ↓
recovery-state обновлён
  ↓
лог сохранён в logs/recovery/
```

---

## 8. Рекомендации по использованию

### 8.1. Регулярная диагностика

Рекомендуется периодически запускать `doctor` для проверки состояния данных:

```bash
node tools/cli/iwdc-recovery.mjs doctor
```

### 8.2. Резервное копирование

Все операции recovery автоматически создают backup перед изменениями. Backup хранятся в `data/recovery/backups/` с timestamp.

### 8.3. Dry-run режим

Перед применением операций рекомендуется использовать `--dry-run`:

```bash
node tools/cli/iwdc-recovery.mjs restore 20250115-143022 --dry-run
node tools/cli/iwdc-recovery.mjs rollback --dry-run
```

### 8.4. Мониторинг recovery-state

Следите за состоянием через `status`:

```bash
node tools/cli/iwdc-recovery.mjs status
```

Особенно важно проверять `lastSuccessfulVersion` — без неё невозможен автоматический откат.

---

## 9. Ограничения и известные проблемы

1. **Auto-recovery требует lastSuccessfulVersion:** если она не установлена, автоматический откат невозможен
2. **Repair plan не восстанавливает удалённые файлы:** только сущности внутри существующих файлов
3. **Type coercion может быть неточным:** сложные преобразования типов могут требовать ручной проверки

---

## 10. См. также

- `docs/pipeline.md` — общий пайплайн IWDC
- `docs/technical-summary-v0.6.md` — техническое резюме механизмов
- `config/recoveryConfig.mjs` — конфигурация Recovery Layer


