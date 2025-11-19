import * as instanceIdModule from "./instance-id.mjs";
import * as instanceDiscovery from "./instance-discovery.mjs";
import * as coordinatorState from "./coordinator-state.mjs";
import * as syncClient from "./sync-client.mjs";
import * as eventBus from "./event-bus.mjs";
import * as logger from "../utils/logger.mjs";
import * as metricsRegistry from "../tools/observability/metrics-registry.mjs";
import * as traces from "../tools/observability/traces.mjs";
import * as eventLogger from "../tools/observability/event-logger.mjs";

/**
 * Leader Election IWDC v1.6
 * 
 * Выбор ведущего инстанса (leader) в кластере IWDC.
 */

/**
 * Интервал перевыборов (мс)
 */
const RE_ELECTION_INTERVAL = 30000; // 30 секунд

/**
 * Таймер перевыборов
 */
let electionTimer = null;
let isParticipating = false;

/**
 * Инициализация Leader Election
 */
export function initialize() {
  // Инициализируем метрики
  metricsRegistry.createCounter('distributed_leader_changes_total', 'Total number of leader changes');
  metricsRegistry.createGauge('distributed_current_leader', 'Current leader instance ID');
  
  eventLogger.log('info', 'Leader Election initialized');
}

/**
 * Начинает участие в выборах лидера
 */
export function startParticipation() {
  if (isParticipating) {
    logger.logWarning('Already participating in leader election');
    return;
  }

  isParticipating = true;
  logger.logInfo('Starting leader election participation');

  // Выполняем первый выбор сразу
  performElection().catch(error => {
    logger.logError(`Initial election failed: ${error.message}`);
  });

  // Запускаем периодические перевыборы
  electionTimer = setInterval(() => {
    performElection().catch(error => {
      logger.logError(`Election cycle failed: ${error.message}`);
    });
  }, RE_ELECTION_INTERVAL);

  eventLogger.log('info', 'Leader election participation started');
}

/**
 * Останавливает участие в выборах
 */
export function stopParticipation() {
  if (!isParticipating) {
    return;
  }

  if (electionTimer) {
    clearInterval(electionTimer);
    electionTimer = null;
  }

  isParticipating = false;
  logger.logInfo('Stopped leader election participation');

  eventLogger.log('info', 'Leader election participation stopped');
}

/**
 * Выполняет выбор лидера
 * @returns {Promise<string|null>} ID выбранного лидера или null
 */
export async function performElection() {
  const traceId = traces.generateTraceId();
  traces.startTrace(traceId, { action: 'LEADER_ELECTION' });
  eventLogger.setTraceId(traceId);

  try {
    const instances = instanceDiscovery.listInstances();
    const localInstanceId = instanceIdModule.getInstanceId();

    if (instances.length === 0) {
      // Нет других инстансов, становимся лидером
      const wasLeader = coordinatorState.isLeader();
      coordinatorState.setLeader(localInstanceId);
      
      if (!wasLeader) {
        metricsRegistry.inc('distributed_leader_changes_total');
        metricsRegistry.set('distributed_current_leader', 1, { instance: localInstanceId });
        
        eventBus.publish(eventBus.EVENT_TYPES.LEADER_ELECTED, {
          leaderId: localInstanceId,
          electedAt: Date.now()
        });
      }

      traces.endTrace(traceId);
      eventLogger.clearTraceId();
      return localInstanceId;
    }

    // Собираем информацию об инстансах
    const candidates = [];
    
    // Добавляем локальный инстанс
    candidates.push({
      id: localInstanceId,
      uptime: process.uptime() * 1000, // в миллисекундах
      isLocal: true
    });

    // Собираем информацию об удалённых инстансах
    for (const instance of instances) {
      if (instance.id === localInstanceId) continue;

      try {
        // Пытаемся получить информацию об инстансе
        const health = await syncClient.checkInstanceHealth(instance);
        if (health) {
          // TODO: Получить uptime от удалённого инстанса через API
          candidates.push({
            id: instance.id,
            uptime: 0, // По умолчанию, если не удалось получить
            isLocal: false
          });
        }
      } catch (error) {
        // Инстанс недоступен, пропускаем
      }
    }

    if (candidates.length === 0) {
      traces.endTrace(traceId);
      eventLogger.clearTraceId();
      return null;
    }

    // Выбираем лидера: highest instanceId (лексикографически)
    candidates.sort((a, b) => {
      // Сначала по uptime (больше = лучше)
      if (a.uptime !== b.uptime) {
        return b.uptime - a.uptime;
      }
      // Затем по instanceId (лексикографически, больше = лучше)
      return b.id.localeCompare(a.id);
    });

    const newLeader = candidates[0];
    const previousLeader = coordinatorState.getLeader()?.id;

    // Устанавливаем нового лидера
    coordinatorState.setLeader(newLeader.id);

    // Если лидер изменился, публикуем событие
    if (previousLeader !== newLeader.id) {
      metricsRegistry.inc('distributed_leader_changes_total');
      metricsRegistry.set('distributed_current_leader', 1, { instance: newLeader.id });

      if (previousLeader) {
        eventBus.publish(eventBus.EVENT_TYPES.LEADER_CHANGED, {
          previousLeader,
          newLeader: newLeader.id,
          electedAt: Date.now()
        });
      } else {
        eventBus.publish(eventBus.EVENT_TYPES.LEADER_ELECTED, {
          leaderId: newLeader.id,
          electedAt: Date.now()
        });
      }

      logger.logInfo(`Leader elected: ${newLeader.id} (was: ${previousLeader || 'none'})`);
    }

    traces.addEvent(traceId, 'LEADER_ELECTED', {
      leaderId: newLeader.id,
      previousLeader
    });
    traces.endTrace(traceId);
    eventLogger.clearTraceId();

    return newLeader.id;
  } catch (error) {
    traces.addEvent(traceId, 'LEADER_ELECTION_ERROR', {
      error: error.message
    });
    traces.endTrace(traceId);
    eventLogger.clearTraceId();
    logger.logError(`Leader election failed: ${error.message}`);
    throw error;
  }
}

/**
 * Получает текущего лидера
 * @returns {Object|null} информация о лидере
 */
export function getCurrentLeader() {
  return coordinatorState.getLeader();
}

/**
 * Проверяет, является ли локальный инстанс лидером
 * @returns {boolean} true если локальный инстанс является лидером
 */
export function isCurrentLeader() {
  return coordinatorState.isLeader();
}

/**
 * Получает статус участия в выборах
 * @returns {Object} статус
 */
export function getStatus() {
  return {
    participating: isParticipating,
    leader: coordinatorState.getLeader(),
    nextElection: electionTimer ? Date.now() + RE_ELECTION_INTERVAL : null
  };
}

/**
 * Экспорт для использования в других модулях
 */
export default {
  initialize,
  startParticipation,
  stopParticipation,
  performElection,
  getCurrentLeader,
  isCurrentLeader,
  getStatus
};

