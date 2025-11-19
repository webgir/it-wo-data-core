import http from "http";
import https from "https";
import { URL } from "url";
import * as logger from "../utils/logger.mjs";
import * as metricsRegistry from "../tools/observability/metrics-registry.mjs";
import * as traces from "../tools/observability/traces.mjs";

/**
 * Remote Sync API Client IWDC v1.5
 * 
 * HTTP-клиент для синхронизации с удалёнными инстансами.
 */

/**
 * Таймаут запросов (мс)
 */
const REQUEST_TIMEOUT = 5000;

/**
 * Инициализация Sync Client
 */
export function initialize() {
  metricsRegistry.createCounter('distributed_remote_sync_requests_total', 'Total number of remote sync requests', ['instance', 'status']);
}

/**
 * Получает журнал событий от удалённого инстанса
 * @param {Object} instance - конфигурация инстанса { id, url }
 * @returns {Promise<Array<Object>>} массив событий
 */
export async function fetchRemoteJournal(instance) {
  try {
    const url = instance.url.replace('/distributed/sync', '/api/v1/distributed/journal');
    const response = await makeRequest(url, 'GET');
    
    metricsRegistry.inc('distributed_remote_sync_requests_total', 1, { instance: instance.id, status: 'success' });
    
    return response.events || [];
  } catch (error) {
    metricsRegistry.inc('distributed_remote_sync_requests_total', 1, { instance: instance.id, status: 'error' });
    throw error;
  }
}

/**
 * Отправляет локальные события на удалённый инстанс
 * @param {Object} instance - конфигурация инстанса
 * @param {Array<Object>} events - массив событий
 * @returns {Promise<void>}
 */
export async function pushLocalEvents(instance, events) {
  const traceId = traces.generateTraceId();
  traces.startTrace(traceId, { action: 'REMOTE_PUSH', instance: instance.id });
  const startTime = Date.now();
  
  try {
    const url = instance.url.replace('/distributed/sync', '/api/v1/distributed/sync');
    await makeRequest(url, 'POST', { events });
    
    const latency = (Date.now() - startTime) / 1000;
    metricsRegistry.inc('distributed_remote_sync_requests_total', 1, { instance: instance.id, status: 'success' });
    metricsRegistry.inc('distributed_remote_success_total', 1, { instance: instance.id });
    metricsRegistry.observe('distributed_replication_latency_seconds', latency);
    
    traces.addEvent(traceId, 'REMOTE_PUSH_SUCCESS', { instance: instance.id, eventsCount: events.length, latency });
    traces.endTrace(traceId);
  } catch (error) {
    const latency = (Date.now() - startTime) / 1000;
    metricsRegistry.inc('distributed_remote_sync_requests_total', 1, { instance: instance.id, status: 'error' });
    metricsRegistry.inc('distributed_remote_errors_total', 1, { instance: instance.id });
    traces.addEvent(traceId, 'REMOTE_PUSH_ERROR', { instance: instance.id, error: error.message, latency });
    traces.endTrace(traceId);
    throw error;
  }
}

/**
 * Получает снапшот от удалённого инстанса
 * @param {Object} instance - конфигурация инстанса
 * @param {string} version - версия снапшота
 * @returns {Promise<Object>} данные снапшота
 */
export async function getRemoteSnapshot(instance, version) {
  try {
    const url = `${instance.url.replace('/distributed/sync', '/api/v1/snapshots')}/${version}`;
    const response = await makeRequest(url, 'GET');
    
    metricsRegistry.inc('distributed_remote_sync_requests_total', 1, { instance: instance.id, status: 'success' });
    
    return response;
  } catch (error) {
    metricsRegistry.inc('distributed_remote_sync_requests_total', 1, { instance: instance.id, status: 'error' });
    throw error;
  }
}

/**
 * Проверяет здоровье инстанса
 * @param {Object} instance - конфигурация инстанса
 * @returns {Promise<boolean>} true если инстанс здоров
 */
export async function checkInstanceHealth(instance) {
  try {
    const url = instance.url.replace('/distributed/sync', '/api/v1/health');
    await makeRequest(url, 'GET', null, 2000);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Выполняет HTTP-запрос
 * @param {string} url - URL
 * @param {string} method - метод (GET, POST)
 * @param {Object} [data] - данные для POST
 * @param {number} [timeout] - таймаут в мс
 * @returns {Promise<Object>} ответ
 */
function makeRequest(url, method = 'GET', data = null, timeout = REQUEST_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname,
      method,
      headers: {
        'Content-Type': 'application/json'
      },
      timeout
    };

    const req = client.request(options, (res) => {
      let responseData = '';

      res.on('data', chunk => {
        responseData += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const json = responseData ? JSON.parse(responseData) : {};
            resolve(json);
          } catch (error) {
            resolve({});
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

/**
 * Экспорт для использования в других модулях
 */
export default {
  initialize,
  fetchRemoteJournal,
  pushLocalEvents,
  getRemoteSnapshot,
  checkInstanceHealth
};

