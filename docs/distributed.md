# IWDC Distributed Data Layer

Документация для Distributed Data Layer IWDC v1.4-v1.6.

## 1. Обзор

Distributed Data Layer обеспечивает синхронизацию данных между несколькими экземплярами IWDC, обеспечивая eventual consistency и координацию операций через механизмы quorum, leader election и distributed locks.

## 2. Архитектура

### 2.1. Основные компоненты

- **Event Bus** (`distributed/event-bus.mjs`) — централизованная шина событий
- **Instance Identity** (`distributed/instance-id.mjs`) — уникальный идентификатор экземпляра
- **Journal** (`distributed/journal.mjs`) — локальный журнал событий
- **Instance Discovery** (`distributed/instance-discovery.mjs`) — обнаружение удалённых инстансов
- **Sync Client** (`distributed/sync-client.mjs`) — HTTP-клиент для синхронизации
- **Sync Engine** (`distributed/sync-engine.mjs`) — движок синхронизации с quorum
- **Coordinator State** (`distributed/coordinator-state.mjs`) — состояние координации
- **Leader Election** (`distributed/leader-election.mjs`) — выбор лидера
- **Heartbeat** (`distributed/heartbeat.mjs`) — система heartbeat
- **Lock Service** (`distributed/lock-service.mjs`) — распределённые блокировки
- **Conflict Resolution** (`distributed/conflict-resolution.mjs`) — разрешение конфликтов
- **Time Sync** (`distributed/time-sync.mjs`) — синхронизация времени

### 2.2. Event Bus

Централизованная шина событий для обмена событиями между инстансами.

**Типы событий:**
- `SNAPSHOT_CREATED` — создан снапшот
- `DIFF_CREATED` — создан diff
- `LEADER_ELECTED` — выбран лидер
- `LEADER_CHANGED` — лидер изменился
- `SKIPPED_QUORUM` — операция пропущена из-за недостаточного quorum
- `SNAPSHOT_PROPOSAL` — предложение снапшота
- `SNAPSHOT_ACCEPT` — принятие снапшота
- `DIFF_PROPOSAL` — предложение diff
- `DIFF_ACCEPT` — принятие diff

## 3. Quorum

### 3.1. Концепция Quorum

Quorum — это минимальное количество инстансов, необходимое для принятия решения о применении snapshot или diff. В IWDC v1.6 quorum рассчитывается как `ceil(total / 2)`, то есть требуется >= 50% здоровых инстансов.

### 3.2. Проверка Quorum

Перед применением snapshot или diff система проверяет:
1. Общее количество инстансов в кластере
2. Количество здоровых инстансов (status: `healthy` или `degraded`)
3. Требуемое количество для quorum (>= 50%)

Если quorum недостаточен, операция пропускается и публикуется событие `SKIPPED_QUORUM`.

### 3.3. API для Quorum

**GET /api/v1/distributed/quorum**

Возвращает информацию о текущем состоянии quorum:

```json
{
  "success": true,
  "data": {
    "total": 3,
    "healthy": 2,
    "required": 2,
    "sufficient": true
  }
}
```

## 4. Proposals Flow (snapshot/diff)

### 4.1. Процесс предложения

1. **Proposal Creation** — инстанс создаёт предложение (snapshot или diff)
2. **Quorum Check** — проверяется достаточность quorum
3. **Broadcast** — предложение отправляется всем инстансам
4. **Vote Collection** — инстансы голосуют (`accept` или `reject`)
5. **Quorum Reached** — при достижении quorum предложение применяется
6. **Accept Event** — публикуется событие принятия

### 4.2. Snapshot Proposal

**POST /api/v1/distributed/propose-snapshot**

Тело запроса:
```json
{
  "version": "1.2.0",
  "hash": "abc123...",
  "signature": "def456..." // опционально
}
```

Ответ:
```json
{
  "success": true,
  "data": {
    "proposalId": "snapshot-1.2.0-1234567890",
    "quorum": {
      "total": 3,
      "healthy": 2,
      "required": 2,
      "sufficient": true
    }
  }
}
```

### 4.3. Diff Proposal

**POST /api/v1/distributed/propose-diff**

Тело запроса:
```json
{
  "from": "1.1.0",
  "to": "1.2.0",
  "hash": "abc123..."
}
```

Ответ аналогичен snapshot proposal.

### 4.4. События Proposals

- `SNAPSHOT_PROPOSAL` — предложение снапшота создано
- `SNAPSHOT_ACCEPT` — снапшот принят кластером
- `DIFF_PROPOSAL` — предложение diff создано
- `DIFF_ACCEPT` — diff принят кластером

## 5. Cluster Acceptance Rules

### 5.1. Правила принятия решений

1. **Quorum Required** — для применения snapshot/diff требуется quorum >= 50%
2. **Vote Majority** — решение принимается большинством голосов `accept`
3. **Leader Priority** — лидер имеет приоритет при конфликтах (опционально)
4. **Signature Verification** — все предложения должны иметь валидную подпись (если включено)
5. **Version Ordering** — снапшоты применяются только если версия больше текущей

### 5.2. Обработка конфликтов

При конфликтах используется Conflict Resolution Framework:
- **last-write-wins** — выбирается последнее по timestamp
- **leader-wins** — выбирается предложение от лидера
- **reject-inconsistent** — отклоняются несовместимые предложения

### 5.3. Безопасность

- Все предложения проверяются на подпись (если включено)
- Хеши проверяются на целостность
- Версии проверяются на порядок
- Только лидер может выдавать блокировки

## 6. Leader Election

### 6.1. Алгоритм выбора

Лидер выбирается по следующим критериям:
1. Наибольший uptime
2. При равном uptime — highest instanceId (лексикографически)

### 6.2. Перевыборы

Перевыборы происходят каждые 30 секунд для обеспечения актуальности лидера.

### 6.3. События

- `LEADER_ELECTED` — выбран новый лидер
- `LEADER_CHANGED` — лидер изменился

## 7. Distributed Locks

### 7.1. Механизм блокировок

Только лидер может выдавать блокировки. Блокировки имеют TTL 30 секунд и автоматически продлеваются каждые 10 секунд.

### 7.2. Использование

```javascript
const lockService = await import('./distributed/lock-service.mjs');
await lockService.acquireLock('resource-name');
// ... работа с ресурсом ...
await lockService.releaseLock('resource-name');
```

## 8. Heartbeat System

### 8.1. Интервалы

- Отправка heartbeat: каждые 5 секунд
- Timeout heartbeat: 15 секунд

### 8.2. Статусы инстансов

- `healthy` — инстанс здоров и отвечает
- `degraded` — инстанс работает, но с ограничениями
- `unreachable` — инстанс не отвечает

## 9. Time Sync

### 9.1. Мягкая синхронизация времени

Система измеряет дрейф времени относительно лидера каждые 60 секунд.

### 9.2. Метрики

- `distributed_clock_drift_ms` — текущий дрейф в миллисекундах
- `distributed_clock_drift_total` — история измерений дрейфа

## 10. CLI Usage

### 10.1. Команды

```bash
# Показать состояние quorum
iwdc-distributed quorum

# Предложить snapshot
iwdc-distributed propose-snapshot --version=1.2.0 --hash=abc123

# Предложить diff
iwdc-distributed propose-diff --from=1.1.0 --to=1.2.0 --hash=def456
```

### 10.2. Конфигурация

Конфигурация инстансов находится в `configs/distributed/instances.json`:

```json
[
  {
    "id": "instance-A",
    "url": "http://hostA:3000/api/v1/distributed/sync"
  },
  {
    "id": "instance-B",
    "url": "http://hostB:3000/api/v1/distributed/sync"
  }
]
```

## 11. Интеграция

### 11.1. Инициализация

```javascript
import * as syncEngine from './distributed/sync-engine.mjs';
import * as leaderElection from './distributed/leader-election.mjs';
import * as heartbeat from './distributed/heartbeat.mjs';

// Инициализация
syncEngine.initialize();
leaderElection.initialize();
heartbeat.initialize();

// Запуск
leaderElection.startParticipation();
heartbeat.startHeartbeat();
```

### 11.2. Использование в build process

Distributed layer интегрируется в `iwdc-build` через события:
- При создании снапшота автоматически публикуется `SNAPSHOT_CREATED`
- При создании diff автоматически публикуется `DIFF_CREATED`
- Sync Engine обрабатывает эти события и реплицирует их в кластер

## 12. Метрики и Observability

Все операции логируются и метрики собираются через Observability Layer (см. `docs/observability.md`).

**Основные метрики:**
- `distributed_sync_total` — общее количество синхронизаций
- `distributed_quorum_skipped_total` — пропущенные операции из-за quorum
- `distributed_proposals_total` — количество предложений
- `distributed_votes_total` — количество голосов
- `distributed_leader_changes_total` — изменения лидера
- `distributed_heartbeat_sent_total` — отправленные heartbeat
- `distributed_locks_acquired_total` — полученные блокировки
- `distributed_conflict_resolutions_total` — разрешения конфликтов
- `distributed_clock_drift_ms` — дрейф времени

**Трейсы:**
- `LEADER_ELECTION`, `HEARTBEAT_SEND`, `LOCK_ACQUIRE`, `REMOTE_PULL`, `REMOTE_PUSH`
- `SNAPSHOT_REPLICATE`, `DIFF_REPLICATE`, `QUORUM_DECISION`, `CONFLICT_DETECTED`

**Event Logger:**
- Все ключевые события логируются с привязкой к trace-id
- Уровни: debug, info, warn, error

Подробнее см. раздел "Observability in Distributed Layer" в `docs/observability.md`.

## 13. Troubleshooting

### 13.1. Quorum недостаточен

**Проблема:** Операции пропускаются из-за недостаточного quorum.

**Решение:**
- Проверить количество здоровых инстансов
- Убедиться, что все инстансы доступны
- Проверить heartbeat timeout

### 13.2. Лидер не выбирается

**Проблема:** Лидер не выбирается или часто меняется.

**Решение:**
- Проверить конфигурацию инстансов
- Убедиться, что все инстансы видят друг друга
- Проверить сетевую связность

### 13.3. Конфликты не разрешаются

**Проблема:** Конфликты не разрешаются автоматически.

**Решение:**
- Проверить стратегию разрешения конфликтов
- Убедиться, что лидер выбран
- Проверить логи событий

---

**Версия документа:** v1.6  
**Последнее обновление:** 2025-01-XX

