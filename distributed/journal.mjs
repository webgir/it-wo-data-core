import fs from "fs";
import path from "path";
import * as paths from "../utils/paths.mjs";
import * as logger from "../utils/logger.mjs";

/**
 * Local Event Journal IWDC v1.4
 * 
 * Локальный журнал событий для распределённой системы.
 */

/**
 * Путь к файлу журнала
 */
const JOURNAL_PATH = path.join(process.cwd(), 'data', 'distributed', 'journal.log');

/**
 * Инициализация Journal
 */
export function initialize() {
  const dir = path.dirname(JOURNAL_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  if (!fs.existsSync(JOURNAL_PATH)) {
    fs.writeFileSync(JOURNAL_PATH, '', 'utf-8');
  }
}

/**
 * Добавляет событие в журнал
 * @param {Object} event - событие
 */
export function append(event) {
  try {
    const entry = JSON.stringify({
      id: event.id,
      type: event.type,
      timestamp: event.timestamp,
      sourceInstance: event.sourceInstance,
      payloadHash: event.payloadHash || null
    }) + '\n';
    
    fs.appendFileSync(JOURNAL_PATH, entry, 'utf-8');
  } catch (error) {
    logger.logError(`Failed to append to journal: ${error.message}`);
    throw error;
  }
}

/**
 * Читает все события из журнала
 * @returns {Array<Object>} массив событий
 */
export function readAll() {
  try {
    if (!fs.existsSync(JOURNAL_PATH)) {
      return [];
    }

    const content = fs.readFileSync(JOURNAL_PATH, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line.trim());
    
    return lines.map(line => {
      try {
        return JSON.parse(line);
      } catch (error) {
        return null;
      }
    }).filter(event => event !== null);
  } catch (error) {
    logger.logError(`Failed to read journal: ${error.message}`);
    return [];
  }
}

/**
 * Фильтрует события по instanceId
 * @param {string} instanceId - ID инстанса
 * @returns {Array<Object>} массив событий
 */
export function filterByInstance(instanceId) {
  const allEvents = readAll();
  return allEvents.filter(event => event.sourceInstance === instanceId);
}

/**
 * Воспроизводит события
 * @param {Array<Object>} events - массив событий
 */
export function replay(events) {
  // Заглушка для replay логики
  logger.logInfo(`Replaying ${events.length} events`);
}

/**
 * Экспорт для использования в других модулях
 */
export default {
  initialize,
  append,
  readAll,
  filterByInstance,
  replay
};

