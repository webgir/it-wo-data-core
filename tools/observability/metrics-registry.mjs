/**
 * Metrics Registry IWDC v1.1
 * 
 * Реестр метрик для Prometheus-совместимого экспорта.
 */

/**
 * Хранилище метрик
 */
const metrics = new Map();

/**
 * Создаёт счётчик
 * @param {string} name - имя метрики
 * @param {string} help - описание
 * @param {Array<string>} [labels] - массив имён лейблов
 */
export function createCounter(name, help, labels = []) {
  if (metrics.has(name)) {
    return;
  }

  metrics.set(name, {
    type: 'counter',
    name,
    help,
    labels,
    value: 0,
    labelValues: new Map()
  });
}

/**
 * Создаёт gauge
 * @param {string} name - имя метрики
 * @param {string} help - описание
 * @param {Array<string>} [labels] - массив имён лейблов
 */
export function createGauge(name, help, labels = []) {
  if (metrics.has(name)) {
    return;
  }

  metrics.set(name, {
    type: 'gauge',
    name,
    help,
    labels,
    value: 0,
    labelValues: new Map()
  });
}

/**
 * Создаёт histogram
 * @param {string} name - имя метрики
 * @param {string} help - описание
 * @param {Array<number>} [buckets] - массив границ корзин
 */
export function createHistogram(name, help, buckets = []) {
  if (metrics.has(name)) {
    return;
  }

  metrics.set(name, {
    type: 'histogram',
    name,
    help,
    buckets,
    observations: [],
    labelValues: new Map()
  });
}

/**
 * Увеличивает счётчик
 * @param {string} name - имя метрики
 * @param {number} [value] - значение для увеличения (по умолчанию 1)
 * @param {Object} [labelValues] - значения лейблов
 */
export function inc(name, value = 1, labelValues = {}) {
  const metric = metrics.get(name);
  if (!metric || metric.type !== 'counter') {
    return;
  }

  const labelKey = JSON.stringify(labelValues);
  if (!metric.labelValues.has(labelKey)) {
    metric.labelValues.set(labelKey, 0);
  }

  metric.labelValues.set(labelKey, metric.labelValues.get(labelKey) + value);
  metric.value += value;
}

/**
 * Устанавливает значение gauge
 * @param {string} name - имя метрики
 * @param {number} value - значение
 * @param {Object} [labelValues] - значения лейблов
 */
export function set(name, value, labelValues = {}) {
  const metric = metrics.get(name);
  if (!metric || metric.type !== 'gauge') {
    return;
  }

  const labelKey = JSON.stringify(labelValues);
  metric.labelValues.set(labelKey, value);
  metric.value = value;
}

/**
 * Добавляет наблюдение в histogram
 * @param {string} name - имя метрики
 * @param {number} value - значение
 * @param {Object} [labelValues] - значения лейблов
 */
export function observe(name, value, labelValues = {}) {
  const metric = metrics.get(name);
  if (!metric || metric.type !== 'histogram') {
    return;
  }

  const labelKey = JSON.stringify(labelValues);
  if (!metric.labelValues.has(labelKey)) {
    metric.labelValues.set(labelKey, []);
  }

  metric.labelValues.get(labelKey).push(value);
  metric.observations.push(value);
}

/**
 * Получает метрику
 * @param {string} name - имя метрики
 * @returns {Object|null} метрика или null
 */
export function getMetric(name) {
  return metrics.get(name) || null;
}

/**
 * Получает все метрики
 * @returns {Map} все метрики
 */
export function getAllMetrics() {
  return metrics;
}

/**
 * Экспорт для использования в других модулях
 */
export default {
  createCounter,
  createGauge,
  createHistogram,
  inc,
  set,
  observe,
  getMetric,
  getAllMetrics
};

