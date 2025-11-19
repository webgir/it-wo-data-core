import { randomUUID } from "crypto";
import * as instanceId from "./instance-id.mjs";
import * as logger from "../utils/logger.mjs";

/**
 * Distributed Event Bus IWDC v1.4
 * 
 * Централизованная шина событий для обмена событиями между инстансами.
 */

/**
 * Типы событий
 */
export const EVENT_TYPES = {
  SNAPSHOT_CREATED: 'SNAPSHOT_CREATED',
  DATA_DIFF_GENERATED: 'DATA_DIFF_GENERATED',
  DIFF_CREATED: 'DIFF_CREATED',
  PLUGIN_INSTALLED: 'PLUGIN_INSTALLED',
  PLUGIN_REMOVED: 'PLUGIN_REMOVED',
  TRANSFORM_COMPLETED: 'TRANSFORM_COMPLETED',
  LEADER_ELECTED: 'LEADER_ELECTED',
  LEADER_CHANGED: 'LEADER_CHANGED',
  SKIPPED_QUORUM: 'SKIPPED_QUORUM'
};

/**
 * Структура события
 * @typedef {Object} DistributedEvent
 * @property {string} id - уникальный ID события (UUID)
 * @property {string} type - тип события (EVENT_TYPES)
 * @property {Object} payload - данные события
 * @property {number} timestamp - время создания (Unix timestamp)
 * @property {string} sourceInstance - ID экземпляра-источника
 */

/**
 * Подписчики на события (Map<eventType, Array<handler>>)
 */
const subscribers = new Map();

/**
 * Очередь событий (для гарантированного порядка)
 */
const eventQueue = [];
let isProcessing = false;

/**
 * Публикует событие
 * @param {string} type - тип события
 * @param {Object} payload - данные события
 * @returns {DistributedEvent} созданное событие
 */
export function publish(type, payload) {
  const event = {
    id: randomUUID(),
    type,
    payload,
    timestamp: Date.now(),
    sourceInstance: instanceId.getInstanceId()
  };

  // Добавляем в очередь
  eventQueue.push(event);

  // Обрабатываем очередь
  processQueue();

  return event;
}

/**
 * Обрабатывает очередь событий
 */
async function processQueue() {
  if (isProcessing || eventQueue.length === 0) {
    return;
  }

  isProcessing = true;

  while (eventQueue.length > 0) {
    const event = eventQueue.shift();
    await notifySubscribers(event);
  }

  isProcessing = false;
}

/**
 * Уведомляет подписчиков о событии
 * @param {DistributedEvent} event - событие
 */
async function notifySubscribers(event) {
  const handlers = subscribers.get(event.type) || [];
  const allHandlers = subscribers.get('*') || [];

  for (const handler of [...handlers, ...allHandlers]) {
    try {
      await handler(event);
    } catch (error) {
      logger.logError(`Event handler error for ${event.type}: ${error.message}`);
    }
  }
}

/**
 * Подписывается на события определённого типа
 * @param {string} eventType - тип события или '*' для всех
 * @param {Function} handler - обработчик события
 */
export function subscribe(eventType, handler) {
  if (!subscribers.has(eventType)) {
    subscribers.set(eventType, []);
  }

  subscribers.get(eventType).push(handler);
}

/**
 * Отписывается от событий
 * @param {string} eventType - тип события
 * @param {Function} handler - обработчик события
 */
export function unsubscribe(eventType, handler) {
  const handlers = subscribers.get(eventType);
  if (handlers) {
    const index = handlers.indexOf(handler);
    if (index !== -1) {
      handlers.splice(index, 1);
    }
  }
}

/**
 * Очищает все подписки
 */
export function clearSubscriptions() {
  subscribers.clear();
}

/**
 * Получает размер очереди
 * @returns {number} размер очереди
 */
export function getQueueSize() {
  return eventQueue.length;
}

/**
 * Экспорт для использования в других модулях
 */
export default {
  EVENT_TYPES,
  publish,
  subscribe,
  unsubscribe,
  clearSubscriptions,
  getQueueSize
};

