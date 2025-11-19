# IWDC Observability Layer

Документация для Observability Layer IWDC v1.1-v1.7.

## 1. Обзор

Observability Layer обеспечивает мониторинг, трейсинг и логирование всех операций IWDC, включая Distributed Layer, API, CLI и внутренние процессы.

## 2. Компоненты

### 2.1. Metrics Registry

**Модуль:** `tools/observability/metrics-registry.mjs`

Реестр метрик для Prometheus-совместимого экспорта.

**Типы метрик:**
- **Counter** — счётчик (только увеличение)
- **Gauge** — текущее значение (может увеличиваться и уменьшаться)
- **Histogram** — распределение значений по корзинам

**Основные функции:**
```javascript
import * as metricsRegistry from '../tools/observability/metrics-registry.mjs';

// Создание метрик
metricsRegistry.createCounter('metric_name', 'Description', ['label1', 'label2']);
metricsRegistry.createGauge('metric_name', 'Description', ['label1']);
metricsRegistry.createHistogram('metric_name', 'Description', [0.1, 0.5, 1, 2, 5]);

// Использование
metricsRegistry.inc('metric_name', 1, { label1: 'value1' });
metricsRegistry.set('metric_name', 100, { label1: 'value1' });
metricsRegistry.observe('metric_name', 0.5, { label1: 'value1' });
```

### 2.2. Traces

**Модуль:** `tools/observability/traces.mjs`

Система трейсинга для отслеживания выполнения операций.

**Основные функции:**
```javascript
import * as traces from '../tools/observability/traces.mjs';

const traceId = traces.generateTraceId();
traces.startTrace(traceId, { action: 'OPERATION_NAME', metadata });
traces.addEvent(traceId, 'EVENT_LABEL', { metadata });
traces.endTrace(traceId);
```

### 2.3. Event Logger

**Модуль:** `tools/observability/event-logger.mjs`

Логирование системных событий с привязкой к трейсам.

**Основные функции:**
```javascript
import * as eventLogger from '../tools/observability/event-logger.mjs';

eventLogger.setTraceId(traceId);
eventLogger.log('info', 'Event message', { metadata });
eventLogger.log('error', 'Error message', { traceId, error });
eventLogger.clearTraceId();
```

### 2.4. Performance Timer

**Модуль:** `tools/observability/perf-timer.mjs`

Высокоточные измерения производительности операций.

**Основные функции:**
```javascript
import * as perfTimer from '../tools/observability/perf-timer.mjs';

perfTimer.start('operation_name');
// ... выполнение операции ...
const duration = perfTimer.end('operation_name'); // возвращает миллисекунды

const stats = perfTimer.getStats('operation_name'); // { min, max, avg, p50, p95, p99 }
```

## 3. Observability in Distributed Layer

### 3.1. Метрики Distributed Layer

**Счётчики:**
- `distributed_sync_total{direction}` — общее количество синхронизаций
- `distributed_sync_errors_total{type}` — ошибки синхронизации
- `distributed_snapshot_replication_total{source}` — репликации снапшотов
- `distributed_diff_replication_total{source}` — репликации diff
- `distributed_quorum_skipped_total{type}` — пропущенные операции из-за quorum
- `distributed_proposals_total{type}` — количество предложений
- `distributed_votes_total{type}` — количество голосов
- `distributed_leader_changes_total` — изменения лидера
- `distributed_heartbeat_sent_total{instance}` — отправленные heartbeat
- `distributed_heartbeat_received_total{instance}` — полученные heartbeat
- `distributed_heartbeat_timeout_total{instance}` — timeout heartbeat
- `distributed_locks_acquired_total{resource}` — полученные блокировки
- `distributed_locks_released_total{resource}` — освобождённые блокировки
- `distributed_locks_failed_total{resource,reason}` — неудачные попытки блокировки
- `distributed_conflict_resolutions_total{strategy,type}` — разрешения конфликтов
- `distributed_remote_sync_requests_total{instance,status}` — запросы к удалённым инстансам
- `distributed_snapshot_apply_errors_total` — ошибки применения снапшотов
- `distributed_diff_apply_errors_total` — ошибки применения diff
- `distributed_api_errors_total{endpoint,status}` — ошибки API
- `distributed_cli_errors_total{command}` — ошибки CLI
- `distributed_proposals_sent_total{type}` — отправленные предложения
- `distributed_proposals_failed_total{type,reason}` — неудачные предложения

**Gauge:**
- `distributed_current_leader{instance}` — текущий лидер
- `distributed_active_locks` — количество активных блокировок
- `distributed_clock_drift_ms` — текущий дрейф времени

**Histogram:**
- `distributed_clock_drift_total` — история измерений дрейфа времени
- `distributed_snapshot_apply_duration_seconds` — длительность применения снапшотов
- `distributed_diff_apply_duration_seconds` — длительность применения diff
- `distributed_replication_latency_seconds` — задержка репликации

### 3.2. Трейсы Distributed Layer

**Основные трейсы:**
- `LEADER_ELECTION` — выбор лидера
- `HEARTBEAT_SEND` — отправка heartbeat
- `HEARTBEAT_RECEIVE` — получение heartbeat
- `LOCK_ACQUIRE` — получение блокировки
- `LOCK_RELEASE` — освобождение блокировки
- `REMOTE_PULL` — получение данных от удалённого инстанса
- `REMOTE_PUSH` — отправка данных на удалённый инстанс
- `SNAPSHOT_REPLICATE` — репликация снапшота
- `DIFF_REPLICATE` — репликация diff
- `SNAPSHOT_APPLY` — применение снапшота
- `DIFF_APPLY` — применение diff
- `CONFLICT_DETECTED` — обнаружение конфликта
- `QUORUM_DECISION` — решение quorum
- `QUORUM_CHECK` — проверка quorum
- `PROPOSE_SNAPSHOT` — предложение снапшота
- `PROPOSE_DIFF` — предложение diff
- `QUORUM_API` — API запрос quorum
- `PROPOSE_SNAPSHOT_API` — API предложение снапшота
- `PROPOSE_DIFF_API` — API предложение diff

### 3.3. Event Logger в Distributed Layer

**Ключевые события:**
- `leader change` — изменение лидера
- `conflict detected` — обнаружение конфликта
- `quorum failure` — недостаточный quorum
- `heartbeat timeout` — timeout heartbeat
- `snapshot replicated` — снапшот реплицирован
- `diff replicated` — diff реплицирован
- `snapshot applied` — снапшот применён
- `diff applied` — diff применён

**Примеры использования:**
```javascript
eventLogger.log('info', 'Leader changed', { traceId, previousLeader, newLeader });
eventLogger.log('warn', 'Quorum insufficient', { traceId, quorum });
eventLogger.log('error', 'Heartbeat timeout', { traceId, instance });
```

## 4. Правила именования

### 4.1. Метрики

**Формат:** `{prefix}_{metric_name}_{suffix}`

**Префиксы:**
- `distributed_` — метрики Distributed Layer
- `api_` — метрики API Layer
- `cli_` — метрики CLI

**Суффиксы:**
- `_total` — счётчик
- `_seconds` — время в секундах
- `_ms` — время в миллисекундах

**Примеры:**
- `distributed_sync_total`
- `distributed_heartbeat_sent_total`
- `distributed_clock_drift_ms`
- `distributed_snapshot_apply_duration_seconds`

### 4.2. Трейсы

**Формат:** `{ACTION}_{OBJECT}` или `{ACTION}`

**Примеры:**
- `LEADER_ELECTION`
- `HEARTBEAT_SEND`
- `SNAPSHOT_APPLY`
- `QUORUM_CHECK`

### 4.3. Event Logger

**Уровни:**
- `debug` — отладочная информация
- `info` — информационные события
- `warn` — предупреждения
- `error` — ошибки

**Формат сообщений:**
- Краткое описание события
- Метаданные в объекте

## 5. Интеграция в API

### 5.1. Trace ID в заголовках

Все API ответы включают заголовок `x-trace-id`:

```javascript
res.writeHead(200, { 
  'Content-Type': 'application/json', 
  'x-trace-id': traceId 
});
```

### 5.2. Обработка ошибок

Все ошибки API фиксируются в метриках и трейсах:

```javascript
metricsRegistry.inc('distributed_api_errors_total', 1, { endpoint: 'quorum', status: '500' });
traces.addEvent(traceId, 'API_ERROR', { endpoint: 'quorum', error: error.message });
eventLogger.log('error', `API error: ${error.message}`, { traceId, endpoint: 'quorum' });
```

## 6. Интеграция в CLI

### 6.1. Трейсинг команд

Все CLI команды создают трейсы:

```javascript
const traceId = traces.generateTraceId();
traces.startTrace(traceId, { action: 'COMMAND_NAME' });
// ... выполнение команды ...
traces.endTrace(traceId);
```

### 6.2. Мониторинг ошибок

Ошибки CLI фиксируются в метриках:

```javascript
metricsRegistry.inc('distributed_cli_errors_total', 1, { command: 'quorum' });
eventLogger.log('error', `Command failed: ${error.message}`, { traceId, command: 'quorum' });
```

## 7. Примеры использования

### 7.1. Полный пример с метриками, трейсами и логами

```javascript
import * as metricsRegistry from '../tools/observability/metrics-registry.mjs';
import * as traces from '../tools/observability/traces.mjs';
import * as eventLogger from '../tools/observability/event-logger.mjs';
import * as perfTimer from '../tools/observability/perf-timer.mjs';

async function performOperation() {
  const traceId = traces.generateTraceId();
  traces.startTrace(traceId, { action: 'OPERATION' });
  eventLogger.setTraceId(traceId);
  const timer = perfTimer.start('operation');

  try {
    // Выполнение операции
    await doWork();

    const duration = perfTimer.end('operation');
    metricsRegistry.inc('operation_success_total');
    metricsRegistry.observe('operation_duration_seconds', duration / 1000);
    
    eventLogger.log('info', 'Operation completed', { traceId, duration });
    traces.addEvent(traceId, 'OPERATION_SUCCESS', { duration });
    traces.endTrace(traceId);
    eventLogger.clearTraceId();
  } catch (error) {
    perfTimer.end('operation');
    metricsRegistry.inc('operation_errors_total');
    eventLogger.log('error', `Operation failed: ${error.message}`, { traceId });
    traces.addEvent(traceId, 'OPERATION_ERROR', { error: error.message });
    traces.endTrace(traceId);
    eventLogger.clearTraceId();
    throw error;
  }
}
```

## 8. Экспорт метрик

Метрики могут быть экспортированы в формате Prometheus через API endpoint `/api/v1/metrics` (если реализован).

**Формат Prometheus:**
```
# TYPE distributed_sync_total counter
distributed_sync_total{direction="push"} 1287

# TYPE distributed_clock_drift_ms gauge
distributed_clock_drift_ms 45.2

# TYPE distributed_snapshot_apply_duration_seconds histogram
distributed_snapshot_apply_duration_seconds_bucket{le="0.1"} 10
distributed_snapshot_apply_duration_seconds_bucket{le="0.5"} 50
distributed_snapshot_apply_duration_seconds_bucket{le="1"} 100
```

## 9. Best Practices

1. **Всегда создавайте трейсы для долгих операций**
2. **Используйте метрики для подсчёта событий и ошибок**
3. **Логируйте важные события через eventLogger**
4. **Измеряйте производительность через perfTimer**
5. **Добавляйте trace-id в API ответы**
6. **Фиксируйте ошибки в метриках и трейсах**
7. **Используйте правильные уровни логирования (debug, info, warn, error)**
8. **Не логируйте чувствительные данные (пароли, токены)**

---

**Версия документа:** v1.7  
**Последнее обновление:** 2025-01-XX

