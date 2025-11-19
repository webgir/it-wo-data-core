/**
 * Event Logger IWDC v1.1
 * 
 * Логирование системных событий с привязкой к трейсам.
 */

/**
 * Уровни логирования
 */
export const LOG_LEVELS = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error'
};

/**
 * Хранилище событий
 */
const events = [];
const MAX_EVENTS = 2000;

/**
 * Текущий trace ID (для привязки событий к трейсам)
 */
let currentTraceId = null;

/**
 * Логирует событие
 * @param {string} level - уровень логирования
 * @param {string} message - сообщение
 * @param {Object} [meta] - метаданные
 */
export function log(level, message, meta = {}) {
  const event = {
    level,
    message,
    timestamp: Date.now(),
    traceId: currentTraceId,
    ...meta
  };

  events.push(event);

  // Ограничиваем количество событий
  if (events.length > MAX_EVENTS) {
    events.shift();
  }

  // Также выводим в консоль для важных событий
  if (level === 'error' || level === 'warn') {
    console.log(`[${level.toUpperCase()}] ${message}`, meta);
  }
}

/**
 * Устанавливает текущий trace ID
 * @param {string} traceId - ID трейса
 */
export function setTraceId(traceId) {
  currentTraceId = traceId;
}

/**
 * Очищает текущий trace ID
 */
export function clearTraceId() {
  currentTraceId = null;
}

/**
 * Получает последние события
 * @param {number} [count] - количество событий
 * @returns {Array<Object>} массив событий
 */
export function getRecent(count = 100) {
  return events.slice(-count);
}

/**
 * Получает события по trace ID
 * @param {string} traceId - ID трейса
 * @returns {Array<Object>} массив событий
 */
export function getEventsByTrace(traceId) {
  return events.filter(event => event.traceId === traceId);
}

/**
 * Экспорт для использования в других модулях
 */
export default {
  LOG_LEVELS,
  log,
  setTraceId,
  clearTraceId,
  getRecent,
  getEventsByTrace
};

