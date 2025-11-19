import * as instanceIdModule from "./instance-id.mjs";
import * as logger from "../utils/logger.mjs";
import * as eventLogger from "../tools/observability/event-logger.mjs";

/**
 * Coordinator State IWDC v1.6
 * 
 * Хранит состояние координации кластера IWDC.
 */

/**
 * Состояние координации
 */
const coordinatorState = {
  leader: null, // { id, electedAt, lastHeartbeat }
  participants: new Map(), // Map<instanceId, { id, lastHeartbeat, status, uptime }>
  lastUpdate: null
};

/**
 * Инициализация Coordinator State
 */
export function initialize() {
  eventLogger.log('info', 'Coordinator State initialized');
}

/**
 * Устанавливает лидера
 * @param {string} leaderId - ID лидера
 * @param {number} [electedAt] - время выбора (timestamp)
 */
export function setLeader(leaderId, electedAt = Date.now()) {
  const previousLeader = coordinatorState.leader?.id;
  
  coordinatorState.leader = {
    id: leaderId,
    electedAt,
    lastHeartbeat: Date.now()
  };
  
  coordinatorState.lastUpdate = Date.now();

  if (previousLeader && previousLeader !== leaderId) {
    logger.logInfo(`Leader changed: ${previousLeader} → ${leaderId}`);
  } else {
    logger.logInfo(`Leader elected: ${leaderId}`);
  }
}

/**
 * Получает текущего лидера
 * @returns {Object|null} информация о лидере или null
 */
export function getLeader() {
  return coordinatorState.leader ? { ...coordinatorState.leader } : null;
}

/**
 * Обновляет heartbeat лидера
 */
export function updateLeaderHeartbeat() {
  if (coordinatorState.leader) {
    coordinatorState.leader.lastHeartbeat = Date.now();
    coordinatorState.lastUpdate = Date.now();
  }
}

/**
 * Проверяет, является ли инстанс лидером
 * @param {string} [checkInstanceId] - ID инстанса (по умолчанию локальный)
 * @returns {boolean} true если инстанс является лидером
 */
export function isLeader(checkInstanceId = null) {
  if (!coordinatorState.leader) {
    return false;
  }

  const localId = checkInstanceId || instanceIdModule.getInstanceId();
  return coordinatorState.leader.id === localId;
}

/**
 * Добавляет или обновляет участника кластера
 * @param {string} participantId - ID участника
 * @param {Object} info - информация об участнике { status, uptime }
 */
export function updateParticipant(participantId, info = {}) {
  const existing = coordinatorState.participants.get(participantId);
  
  coordinatorState.participants.set(participantId, {
    id: participantId,
    lastHeartbeat: Date.now(),
    status: info.status || 'healthy',
    uptime: info.uptime || 0,
    ...info
  });

  coordinatorState.lastUpdate = Date.now();
}

/**
 * Удаляет участника из кластера
 * @param {string} participantId - ID участника
 */
export function removeParticipant(participantId) {
  coordinatorState.participants.delete(participantId);
  coordinatorState.lastUpdate = Date.now();
  logger.logInfo(`Participant removed: ${participantId}`);
}

/**
 * Получает всех участников
 * @returns {Array<Object>} массив участников
 */
export function getParticipants() {
  return Array.from(coordinatorState.participants.values());
}

/**
 * Получает участника по ID
 * @param {string} participantId - ID участника
 * @returns {Object|null} информация об участнике или null
 */
export function getParticipant(participantId) {
  return coordinatorState.participants.get(participantId) || null;
}

/**
 * Получает количество здоровых участников
 * @returns {number} количество здоровых участников
 */
export function getHealthyParticipantsCount() {
  let count = 0;
  for (const participant of coordinatorState.participants.values()) {
    if (participant.status === 'healthy' || participant.status === 'degraded') {
      count++;
    }
  }
  return count;
}

/**
 * Получает общее состояние координации
 * @returns {Object} состояние координации
 */
export function getState() {
  return {
    leader: coordinatorState.leader ? { ...coordinatorState.leader } : null,
    participants: getParticipants(),
    participantsCount: coordinatorState.participants.size,
    healthyCount: getHealthyParticipantsCount(),
    lastUpdate: coordinatorState.lastUpdate
  };
}

/**
 * Очищает состояние координации
 */
export function clearState() {
  coordinatorState.leader = null;
  coordinatorState.participants.clear();
  coordinatorState.lastUpdate = Date.now();
  logger.logInfo('Coordinator state cleared');
}

/**
 * Экспорт для использования в других модулях
 */
export default {
  initialize,
  setLeader,
  getLeader,
  updateLeaderHeartbeat,
  isLeader,
  updateParticipant,
  removeParticipant,
  getParticipants,
  getParticipant,
  getHealthyParticipantsCount,
  getState,
  clearState
};

