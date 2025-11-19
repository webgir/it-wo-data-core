import * as instanceIdModule from "./instance-id.mjs";
import * as coordinatorState from "./coordinator-state.mjs";
import * as logger from "../utils/logger.mjs";
import * as metricsRegistry from "../tools/observability/metrics-registry.mjs";
import * as traces from "../tools/observability/traces.mjs";
import * as eventLogger from "../tools/observability/event-logger.mjs";

/**
 * Distributed Lock Service IWDC v1.6
 * 
 * Распределённая служба блокировок для координации доступа к ресурсам.
 */

/**
 * TTL блокировки (мс)
 */
const LOCK_TTL = 30000; // 30 секунд

/**
 * Интервал продления блокировки (мс)
 */
const LOCK_RENEWAL_INTERVAL = 10000; // 10 секунд

/**
 * Активные блокировки: Map<resource, { holder, acquiredAt, expiresAt, renewTimer }>
 */
const activeLocks = new Map();

/**
 * Таймеры продления блокировок
 */
const renewalTimers = new Map();

/**
 * Инициализация Lock Service
 */
export function initialize() {
  // Инициализируем метрики
  metricsRegistry.createCounter('distributed_locks_acquired_total', 'Total number of locks acquired', ['resource']);
  metricsRegistry.createCounter('distributed_locks_released_total', 'Total number of locks released', ['resource']);
  metricsRegistry.createCounter('distributed_locks_failed_total', 'Total number of failed lock acquisitions', ['resource', 'reason']);
  metricsRegistry.createGauge('distributed_active_locks', 'Number of active locks');
  
  eventLogger.log('info', 'Lock Service initialized');
}

/**
 * Запрашивает блокировку ресурса
 * @param {string} resource - имя ресурса
 * @param {number} [ttl] - TTL блокировки в мс
 * @returns {Promise<boolean>} true если блокировка получена
 */
export async function acquireLock(resource, ttl = LOCK_TTL) {
  const traceId = traces.generateTraceId();
  traces.startTrace(traceId, { action: 'LOCK_ACQUIRE', resource });
  eventLogger.setTraceId(traceId);

  try {
    // Проверяем, что мы лидер (только лидер может выдавать блокировки)
    if (!coordinatorState.isLeader()) {
      logger.logWarning(`Cannot acquire lock: not the leader`);
      metricsRegistry.inc('distributed_locks_failed_total', 1, { resource, reason: 'not_leader' });
      traces.addEvent(traceId, 'LOCK_ACQUIRE_FAILED', { reason: 'not_leader' });
      traces.endTrace(traceId);
      eventLogger.clearTraceId();
      return false;
    }

    const localInstanceId = instanceIdModule.getInstanceId();
    const now = Date.now();

    // Проверяем существующую блокировку
    const existingLock = activeLocks.get(resource);
    
    if (existingLock) {
      // Проверяем, не истекла ли блокировка
      if (existingLock.expiresAt > now) {
        // Блокировка активна и принадлежит другому инстансу
        if (existingLock.holder !== localInstanceId) {
          logger.logWarning(`Lock ${resource} is held by ${existingLock.holder}`);
          metricsRegistry.inc('distributed_locks_failed_total', 1, { resource, reason: 'already_locked' });
          traces.addEvent(traceId, 'LOCK_ACQUIRE_FAILED', { reason: 'already_locked', holder: existingLock.holder });
          traces.endTrace(traceId);
          eventLogger.clearTraceId();
          return false;
        } else {
          // Блокировка уже принадлежит нам, продлеваем
          existingLock.expiresAt = now + ttl;
          traces.addEvent(traceId, 'LOCK_RENEWED', { resource });
          traces.endTrace(traceId);
          eventLogger.clearTraceId();
          return true;
        }
      } else {
        // Блокировка истекла, освобождаем
        releaseLock(resource, false);
      }
    }

    // Создаём новую блокировку
    const lock = {
      resource,
      holder: localInstanceId,
      acquiredAt: now,
      expiresAt: now + ttl
    };

    activeLocks.set(resource, lock);
    metricsRegistry.inc('distributed_locks_acquired_total', 1, { resource });
    metricsRegistry.set('distributed_active_locks', activeLocks.size);

    // Запускаем таймер продления
    startLockRenewal(resource, ttl);

    logger.logInfo(`Lock acquired: ${resource} (TTL: ${ttl}ms)`);

    traces.addEvent(traceId, 'LOCK_ACQUIRED', {
      resource,
      ttl
    });
    traces.endTrace(traceId);
    eventLogger.clearTraceId();

    return true;
  } catch (error) {
    metricsRegistry.inc('distributed_locks_failed_total', 1, { resource, reason: 'error' });
    traces.addEvent(traceId, 'LOCK_ACQUIRE_ERROR', {
      error: error.message
    });
    traces.endTrace(traceId);
    eventLogger.clearTraceId();
    logger.logError(`Failed to acquire lock ${resource}: ${error.message}`);
    return false;
  }
}

/**
 * Освобождает блокировку ресурса
 * @param {string} resource - имя ресурса
 * @param {boolean} [checkHolder] - проверять ли владельца (по умолчанию true)
 * @returns {boolean} true если блокировка освобождена
 */
export function releaseLock(resource, checkHolder = true) {
  const traceId = traces.generateTraceId();
  traces.startTrace(traceId, { action: 'LOCK_RELEASE', resource });
  eventLogger.setTraceId(traceId);

  try {
    const lock = activeLocks.get(resource);
    
    if (!lock) {
      traces.endTrace(traceId);
      eventLogger.clearTraceId();
      return false;
    }

    // Проверяем владельца
    if (checkHolder) {
      const localInstanceId = instanceIdModule.getInstanceId();
      if (lock.holder !== localInstanceId) {
        logger.logWarning(`Cannot release lock ${resource}: not the holder`);
        traces.addEvent(traceId, 'LOCK_RELEASE_FAILED', { reason: 'not_holder' });
        traces.endTrace(traceId);
        eventLogger.clearTraceId();
        return false;
      }
    }

    // Останавливаем таймер продления
    stopLockRenewal(resource);

    // Удаляем блокировку
    activeLocks.delete(resource);
    metricsRegistry.inc('distributed_locks_released_total', 1, { resource });
    metricsRegistry.set('distributed_active_locks', activeLocks.size);

    logger.logInfo(`Lock released: ${resource}`);

    traces.addEvent(traceId, 'LOCK_RELEASED', { resource });
    traces.endTrace(traceId);
    eventLogger.clearTraceId();

    return true;
  } catch (error) {
    traces.endTrace(traceId);
    eventLogger.clearTraceId();
    logger.logError(`Failed to release lock ${resource}: ${error.message}`);
    return false;
  }
}

/**
 * Получает информацию о блокировке
 * @param {string} resource - имя ресурса
 * @returns {Object|null} информация о блокировке или null
 */
export function getLockInfo(resource) {
  const lock = activeLocks.get(resource);
  
  if (!lock) {
    return null;
  }

  const now = Date.now();
  return {
    resource: lock.resource,
    holder: lock.holder,
    acquiredAt: lock.acquiredAt,
    expiresAt: lock.expiresAt,
    remaining: Math.max(0, lock.expiresAt - now),
    isExpired: lock.expiresAt <= now
  };
}

/**
 * Получает все активные блокировки
 * @returns {Array<Object>} массив блокировок
 */
export function getAllLocks() {
  const locks = [];
  const now = Date.now();

  for (const lock of activeLocks.values()) {
    locks.push({
      resource: lock.resource,
      holder: lock.holder,
      acquiredAt: lock.acquiredAt,
      expiresAt: lock.expiresAt,
      remaining: Math.max(0, lock.expiresAt - now),
      isExpired: lock.expiresAt <= now
    });
  }

  return locks;
}

/**
 * Запускает продление блокировки
 * @param {string} resource - имя ресурса
 * @param {number} ttl - TTL блокировки
 */
function startLockRenewal(resource, ttl) {
  // Останавливаем предыдущий таймер, если есть
  stopLockRenewal(resource);

  const timer = setInterval(() => {
    const lock = activeLocks.get(resource);
    
    if (!lock) {
      stopLockRenewal(resource);
      return;
    }

    // Проверяем, что мы всё ещё лидер
    if (!coordinatorState.isLeader()) {
      // Больше не лидер, освобождаем блокировку
      releaseLock(resource, false);
      return;
    }

    // Продлеваем блокировку
    const now = Date.now();
    lock.expiresAt = now + ttl;
    
    logger.logInfo(`Lock renewed: ${resource} (TTL: ${ttl}ms)`);
  }, LOCK_RENEWAL_INTERVAL);

  renewalTimers.set(resource, timer);
}

/**
 * Останавливает продление блокировки
 * @param {string} resource - имя ресурса
 */
function stopLockRenewal(resource) {
  const timer = renewalTimers.get(resource);
  if (timer) {
    clearInterval(timer);
    renewalTimers.delete(resource);
  }
}

/**
 * Очищает все блокировки (при потере лидерства)
 */
export function clearAllLocks() {
  for (const resource of activeLocks.keys()) {
    stopLockRenewal(resource);
  }
  
  activeLocks.clear();
  renewalTimers.clear();
  metricsRegistry.set('distributed_active_locks', 0);
  
  logger.logInfo('All locks cleared (leader lost)');
}

/**
 * Очищает истекшие блокировки
 */
export function cleanupExpiredLocks() {
  const now = Date.now();
  const expired = [];

  for (const [resource, lock] of activeLocks.entries()) {
    if (lock.expiresAt <= now) {
      expired.push(resource);
    }
  }

  for (const resource of expired) {
    releaseLock(resource, false);
  }

  if (expired.length > 0) {
    logger.logInfo(`Cleaned up ${expired.length} expired locks`);
  }
}

/**
 * Экспорт для использования в других модулях
 */
export default {
  initialize,
  acquireLock,
  releaseLock,
  getLockInfo,
  getAllLocks,
  clearAllLocks,
  cleanupExpiredLocks
};

