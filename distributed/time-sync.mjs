import * as instanceIdModule from "./instance-id.mjs";
import * as coordinatorState from "./coordinator-state.mjs";
import * as instanceDiscovery from "./instance-discovery.mjs";
import * as logger from "../utils/logger.mjs";
import * as metricsRegistry from "../tools/observability/metrics-registry.mjs";
import * as traces from "../tools/observability/traces.mjs";
import * as eventLogger from "../tools/observability/event-logger.mjs";
import http from "http";
import https from "https";
import { URL } from "url";

/**
 * Cluster Time Sync (Soft Clock Sync) IWDC v1.6
 * 
 * Мягкая синхронизация времени между инстансами кластера.
 */

/**
 * Интервал измерения дрейфа (мс)
 */
const DRIFT_CHECK_INTERVAL = 60000; // 60 секунд

/**
 * Таймер проверки дрейфа
 */
let driftTimer = null;
let isRunning = false;

/**
 * Текущий дрейф времени (мс)
 */
let currentDrift = 0;

/**
 * История измерений дрейфа
 */
const driftHistory = [];
const MAX_DRIFT_HISTORY = 100;

/**
 * Инициализация Time Sync
 */
export function initialize() {
  // Инициализируем метрики
  metricsRegistry.createGauge('distributed_clock_drift_ms', 'Current clock drift in milliseconds');
  metricsRegistry.createHistogram('distributed_clock_drift_total', 'Clock drift measurements', [-1000, -500, -100, 0, 100, 500, 1000]);
  
  eventLogger.log('info', 'Time Sync initialized');
}

/**
 * Запускает периодическую проверку дрейфа времени
 */
export function startTimeSync() {
  if (isRunning) {
    logger.logWarning('Time sync is already running');
    return;
  }

  isRunning = true;
  logger.logInfo('Starting time sync');

  // Выполняем первую проверку сразу
  measureDrift().catch(error => {
    logger.logError(`Initial drift measurement failed: ${error.message}`);
  });

  // Запускаем периодическую проверку
  driftTimer = setInterval(() => {
    measureDrift().catch(error => {
      logger.logError(`Drift measurement failed: ${error.message}`);
    });
  }, DRIFT_CHECK_INTERVAL);

  eventLogger.log('info', 'Time sync started');
}

/**
 * Останавливает проверку дрейфа времени
 */
export function stopTimeSync() {
  if (!isRunning) {
    return;
  }

  if (driftTimer) {
    clearInterval(driftTimer);
    driftTimer = null;
  }

  isRunning = false;
  logger.logInfo('Time sync stopped');

  eventLogger.log('info', 'Time sync stopped');
}

/**
 * Измеряет дрейф времени относительно лидера
 */
async function measureDrift() {
  const traceId = traces.generateTraceId();
  traces.startTrace(traceId, { action: 'TIME_DRIFT_MEASURE' });
  eventLogger.setTraceId(traceId);

  try {
    const leader = coordinatorState.getLeader();
    
    if (!leader) {
      // Нет лидера, дрейф = 0
      currentDrift = 0;
      metricsRegistry.set('distributed_clock_drift_ms', 0);
      traces.endTrace(traceId);
      eventLogger.clearTraceId();
      return;
    }

    const localInstanceId = instanceIdModule.getInstanceId();
    
    // Если мы лидер, дрейф = 0
    if (leader.id === localInstanceId) {
      currentDrift = 0;
      metricsRegistry.set('distributed_clock_drift_ms', 0);
      traces.endTrace(traceId);
      eventLogger.clearTraceId();
      return;
    }

    // Получаем время лидера через API
    const instances = instanceDiscovery.listInstances();
    const leaderInstance = instances.find(inst => inst.id === leader.id);
    
    if (!leaderInstance) {
      traces.endTrace(traceId);
      eventLogger.clearTraceId();
      return;
    }

    // Измеряем дрейф через запрос к лидеру
    const drift = await measureDriftFromLeader(leaderInstance);

    // Обновляем текущий дрейф
    currentDrift = drift;
    metricsRegistry.set('distributed_clock_drift_ms', drift);
    metricsRegistry.observe('distributed_clock_drift_total', drift);

    // Сохраняем в историю
    driftHistory.push({
      timestamp: Date.now(),
      drift
    });

    if (driftHistory.length > MAX_DRIFT_HISTORY) {
      driftHistory.shift();
    }

    traces.addEvent(traceId, 'TIME_DRIFT_MEASURED', {
      drift,
      leader: leader.id
    });
    traces.endTrace(traceId);
    eventLogger.clearTraceId();

    if (Math.abs(drift) > 1000) {
      logger.logWarning(`Significant clock drift detected: ${drift}ms`);
    }
  } catch (error) {
    traces.endTrace(traceId);
    eventLogger.clearTraceId();
    logger.logError(`Failed to measure drift: ${error.message}`);
  }
}

/**
 * Измеряет дрейф времени относительно лидера
 * @param {Object} leaderInstance - конфигурация лидера
 * @returns {Promise<number>} дрейф времени в мс
 */
async function measureDriftFromLeader(leaderInstance) {
  return new Promise((resolve, reject) => {
    const url = leaderInstance.url.replace('/distributed/sync', '/api/v1/distributed/info');
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    const startTime = Date.now();

    const req = client.get(url, (res) => {
      const endTime = Date.now();
      const roundTripTime = endTime - startTime;
      const serverTime = res.headers['x-server-time'] ? parseInt(res.headers['x-server-time']) : null;

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          if (serverTime) {
            // Вычисляем дрейф: (локальное_время - серверное_время) - (RTT / 2)
            const estimatedServerTime = serverTime + (roundTripTime / 2);
            const drift = Date.now() - estimatedServerTime;
            resolve(drift);
          } else {
            // Если нет заголовка, используем простую оценку
            resolve(0);
          }
        } catch (error) {
          resolve(0);
        }
      });
    });

    req.on('error', () => {
      resolve(0); // При ошибке дрейф = 0
    });

    req.setTimeout(2000, () => {
      req.destroy();
      resolve(0); // При timeout дрейф = 0
    });
  });
}

/**
 * Получает текущий дрейф времени
 * @returns {number} дрейф в миллисекундах
 */
export function getCurrentDrift() {
  return currentDrift;
}

/**
 * Получает историю измерений дрейфа
 * @param {number} [limit] - максимальное количество записей
 * @returns {Array<Object>} история измерений
 */
export function getDriftHistory(limit = 50) {
  return driftHistory.slice(-limit);
}

/**
 * Получает статистику дрейфа
 * @returns {Object} статистика
 */
export function getDriftStats() {
  if (driftHistory.length === 0) {
    return {
      current: 0,
      min: 0,
      max: 0,
      avg: 0,
      samples: 0
    };
  }

  const drifts = driftHistory.map(d => d.drift);
  const min = Math.min(...drifts);
  const max = Math.max(...drifts);
  const avg = drifts.reduce((sum, d) => sum + d, 0) / drifts.length;

  return {
    current: currentDrift,
    min,
    max,
    avg,
    samples: driftHistory.length
  };
}

/**
 * Получает статус time sync
 * @returns {Object} статус
 */
export function getStatus() {
  return {
    running: isRunning,
    interval: DRIFT_CHECK_INTERVAL,
    currentDrift,
    nextCheck: driftTimer ? Date.now() + DRIFT_CHECK_INTERVAL : null
  };
}

/**
 * Экспорт для использования в других модулях
 */
export default {
  initialize,
  startTimeSync,
  stopTimeSync,
  getCurrentDrift,
  getDriftHistory,
  getDriftStats,
  getStatus
};

