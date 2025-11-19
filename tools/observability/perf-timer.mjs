/**
 * Performance Timer IWDC v1.1
 * 
 * Высокоточные измерения производительности операций.
 */

/**
 * Хранилище таймеров
 */
const timers = new Map();

/**
 * Начинает измерение
 * @param {string} label - метка таймера
 * @returns {bigint} начальное время (hrtime)
 */
export function start(label) {
  const startTime = process.hrtime.bigint();
  timers.set(label, {
    start: startTime,
    end: null,
    duration: null,
    measurements: []
  });
  return startTime;
}

/**
 * Завершает измерение
 * @param {string} label - метка таймера
 * @returns {number} длительность в миллисекундах
 */
export function end(label) {
  const timer = timers.get(label);
  if (!timer) {
    return null;
  }

  const endTime = process.hrtime.bigint();
  const durationNs = endTime - timer.start;
  const durationMs = Number(durationNs) / 1000000; // наносекунды в миллисекунды

  timer.end = endTime;
  timer.duration = durationMs;
  timer.measurements.push(durationMs);

  return durationMs;
}

/**
 * Получает статистику по таймеру
 * @param {string} label - метка таймера
 * @returns {Object|null} статистика или null
 */
export function getStats(label) {
  const timer = timers.get(label);
  if (!timer || timer.measurements.length === 0) {
    return null;
  }

  const measurements = timer.measurements;
  const sorted = [...measurements].sort((a, b) => a - b);

  return {
    count: measurements.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: measurements.reduce((sum, val) => sum + val, 0) / measurements.length,
    p50: sorted[Math.floor(sorted.length * 0.5)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    p99: sorted[Math.floor(sorted.length * 0.99)]
  };
}

/**
 * Очищает таймер
 * @param {string} label - метка таймера
 */
export function clear(label) {
  timers.delete(label);
}

/**
 * Очищает все таймеры
 */
export function clearAll() {
  timers.clear();
}

/**
 * Экспорт для использования в других модулях
 */
export default {
  start,
  end,
  getStats,
  clear,
  clearAll
};

