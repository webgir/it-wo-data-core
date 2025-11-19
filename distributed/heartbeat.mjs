import * as instanceIdModule from "./instance-id.mjs";
import * as instanceDiscovery from "./instance-discovery.mjs";
import * as coordinatorState from "./coordinator-state.mjs";
import * as syncClient from "./sync-client.mjs";
import * as logger from "../utils/logger.mjs";
import * as metricsRegistry from "../tools/observability/metrics-registry.mjs";
import * as traces from "../tools/observability/traces.mjs";
import * as eventLogger from "../tools/observability/event-logger.mjs";

/**
 * Heartbeat System IWDC v1.6
 * 
 * Система heartbeat для отслеживания состояния инстансов.
 */

/**
 * Интервал отправки heartbeat (мс)
 */
const HEARTBEAT_INTERVAL = 5000; // 5 секунд

/**
 * Таймаут heartbeat (мс)
 */
const HEARTBEAT_TIMEOUT = 15000; // 15 секунд

/**
 * Таймер heartbeat
 */
let heartbeatTimer = null;
let isRunning = false;

/**
 * Инициализация Heartbeat System
 */
export function initialize() {
  // Инициализируем метрики
  metricsRegistry.createCounter('distributed_heartbeat_sent_total', 'Total number of heartbeats sent', ['instance']);
  metricsRegistry.createCounter('distributed_heartbeat_received_total', 'Total number of heartbeats received', ['instance']);
  metricsRegistry.createCounter('distributed_heartbeat_timeout_total', 'Total number of heartbeat timeouts', ['instance']);
  
  eventLogger.log('info', 'Heartbeat System initialized');
}

/**
 * Запускает отправку heartbeat
 */
export function startHeartbeat() {
  if (isRunning) {
    logger.logWarning('Heartbeat is already running');
    return;
  }

  isRunning = true;
  logger.logInfo('Starting heartbeat system');

  // Отправляем первый heartbeat сразу
  sendHeartbeat().catch(error => {
    logger.logError(`Initial heartbeat failed: ${error.message}`);
  });

  // Запускаем периодическую отправку
  heartbeatTimer = setInterval(() => {
    sendHeartbeat().catch(error => {
      logger.logError(`Heartbeat cycle failed: ${error.message}`);
    });
  }, HEARTBEAT_INTERVAL);

  eventLogger.log('info', 'Heartbeat system started');
}

/**
 * Останавливает отправку heartbeat
 */
export function stopHeartbeat() {
  if (!isRunning) {
    return;
  }

  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  isRunning = false;
  logger.logInfo('Heartbeat system stopped');

  eventLogger.log('info', 'Heartbeat system stopped');
}

/**
 * Отправляет heartbeat всем инстансам
 */
async function sendHeartbeat() {
  const traceId = traces.generateTraceId();
  traces.startTrace(traceId, { action: 'HEARTBEAT_SEND' });
  eventLogger.setTraceId(traceId);

  try {
    const instances = instanceDiscovery.listInstances();
    const localInstanceId = instanceIdModule.getInstanceId();
    const remoteInstances = instances.filter(inst => inst.id !== localInstanceId);

    // Обновляем информацию о локальном инстансе
    coordinatorState.updateParticipant(localInstanceId, {
      status: 'healthy',
      uptime: process.uptime() * 1000
    });

    // Отправляем heartbeat удалённым инстансам
    for (const instance of remoteInstances) {
      try {
        await sendHeartbeatToInstance(instance);
        metricsRegistry.inc('distributed_heartbeat_sent_total', 1, { instance: instance.id });
      } catch (error) {
        logger.logWarning(`Failed to send heartbeat to ${instance.id}: ${error.message}`);
      }
    }

    // Обновляем heartbeat лидера, если мы лидер
    if (coordinatorState.isLeader()) {
      coordinatorState.updateLeaderHeartbeat();
    }

    traces.endTrace(traceId);
    eventLogger.clearTraceId();
  } catch (error) {
    traces.endTrace(traceId);
    eventLogger.clearTraceId();
    logger.logError(`Heartbeat send failed: ${error.message}`);
  }
}

/**
 * Отправляет heartbeat конкретному инстансу
 * @param {Object} instance - конфигурация инстанса
 */
async function sendHeartbeatToInstance(instance) {
  try {
    const url = instance.url.replace('/distributed/sync', '/api/v1/distributed/heartbeat');
    const http = await import('http');
    const https = await import('https');
    const { URL } = await import('url');

    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    const heartbeatData = {
      instanceId: instanceIdModule.getInstanceId(),
      timestamp: Date.now(),
      uptime: process.uptime() * 1000,
      status: 'healthy'
    };

    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(heartbeatData);

      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: 2000
      };

      const req = client.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve();
          } else {
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Heartbeat timeout'));
      });

      req.write(postData);
      req.end();
    });
  } catch (error) {
    throw new Error(`Failed to send heartbeat: ${error.message}`);
  }
}

/**
 * Обрабатывает входящий heartbeat
 * @param {Object} heartbeatData - данные heartbeat { instanceId, timestamp, uptime, status }
 */
export function receiveHeartbeat(heartbeatData) {
  const traceId = traces.generateTraceId();
  traces.startTrace(traceId, { action: 'HEARTBEAT_RECEIVE', instance: heartbeatData.instanceId });
  eventLogger.setTraceId(traceId);

  try {
    const { instanceId: senderId, timestamp, uptime, status } = heartbeatData;

    // Обновляем информацию об участнике
    coordinatorState.updateParticipant(senderId, {
      status: status || 'healthy',
      uptime: uptime || 0,
      lastHeartbeat: timestamp || Date.now()
    });

    metricsRegistry.inc('distributed_heartbeat_received_total', 1, { instance: senderId });

    traces.addEvent(traceId, 'HEARTBEAT_RECEIVED', {
      instance: senderId
    });
    traces.endTrace(traceId);
    eventLogger.clearTraceId();
  } catch (error) {
    traces.endTrace(traceId);
    eventLogger.clearTraceId();
    logger.logError(`Failed to process heartbeat: ${error.message}`);
  }
}

/**
 * Проверяет timeout heartbeat для участников
 */
export function checkHeartbeatTimeouts() {
  const now = Date.now();
  const participants = coordinatorState.getParticipants();

  for (const participant of participants) {
    const timeSinceLastHeartbeat = now - participant.lastHeartbeat;
    
    if (timeSinceLastHeartbeat > HEARTBEAT_TIMEOUT) {
      // Участник не отвечает
      coordinatorState.updateParticipant(participant.id, {
        status: 'unreachable'
      });
      
      metricsRegistry.inc('distributed_heartbeat_timeout_total', 1, { instance: participant.id });
      logger.logWarning(`Heartbeat timeout for ${participant.id}`);
    }
  }
}

/**
 * Получает статус heartbeat системы
 * @returns {Object} статус
 */
export function getStatus() {
  return {
    running: isRunning,
    interval: HEARTBEAT_INTERVAL,
    timeout: HEARTBEAT_TIMEOUT,
    nextHeartbeat: heartbeatTimer ? Date.now() + HEARTBEAT_INTERVAL : null
  };
}

/**
 * Экспорт для использования в других модулях
 */
export default {
  initialize,
  startHeartbeat,
  stopHeartbeat,
  receiveHeartbeat,
  checkHeartbeatTimeouts,
  getStatus
};

