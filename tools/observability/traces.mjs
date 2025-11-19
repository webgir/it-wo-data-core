/**
 * Traces IWDC v1.1
 * 
 * Система трейсинга для отслеживания выполнения операций.
 */

/**
 * Хранилище трейсов
 */
const traces = new Map();
const MAX_TRACES = 500;

/**
 * Генерирует уникальный trace ID
 * @returns {string} trace ID
 */
export function generateTraceId() {
  return `trace-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Начинает трейс
 * @param {string} traceId - ID трейса
 * @param {Object} [metadata] - метаданные трейса
 */
export function startTrace(traceId, metadata = {}) {
  traces.set(traceId, {
    id: traceId,
    start: Date.now(),
    end: null,
    duration: null,
    events: [],
    metadata
  });

  // Ограничиваем количество трейсов
  if (traces.size > MAX_TRACES) {
    const firstKey = traces.keys().next().value;
    traces.delete(firstKey);
  }
}

/**
 * Завершает трейс
 * @param {string} traceId - ID трейса
 */
export function endTrace(traceId) {
  const trace = traces.get(traceId);
  if (!trace) {
    return;
  }

  trace.end = Date.now();
  trace.duration = trace.end - trace.start;
}

/**
 * Добавляет событие в трейс
 * @param {string} traceId - ID трейса
 * @param {string} label - метка события
 * @param {Object} [metadata] - метаданные события
 */
export function addEvent(traceId, label, metadata = {}) {
  const trace = traces.get(traceId);
  if (!trace) {
    return;
  }

  trace.events.push({
    label,
    timestamp: Date.now(),
    metadata
  });
}

/**
 * Получает трейс
 * @param {string} traceId - ID трейса
 * @returns {Object|null} трейс или null
 */
export function getTrace(traceId) {
  return traces.get(traceId) || null;
}

/**
 * Получает все трейсы
 * @returns {Map} все трейсы
 */
export function getAllTraces() {
  return traces;
}

/**
 * Очищает старые трейсы
 */
export function cleanupOldTraces() {
  const now = Date.now();
  const maxAge = 3600000; // 1 час

  for (const [traceId, trace] of traces.entries()) {
    if (trace.end && (now - trace.end) > maxAge) {
      traces.delete(traceId);
    }
  }
}

/**
 * Экспорт для использования в других модулях
 */
export default {
  generateTraceId,
  startTrace,
  endTrace,
  addEvent,
  getTrace,
  getAllTraces,
  cleanupOldTraces
};

