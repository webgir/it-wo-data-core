import fs from "fs";
import path from "path";
import * as logger from "../utils/logger.mjs";

/**
 * Instance Discovery IWDC v1.5
 * 
 * Статическое обнаружение удалённых инстансов IWDC.
 */

/**
 * Путь к конфигурации инстансов
 */
const INSTANCES_CONFIG_PATH = path.join(process.cwd(), 'configs', 'distributed', 'instances.json');

/**
 * Кэш списка инстансов
 */
let cachedInstances = [];

/**
 * Инициализация Instance Discovery
 */
export function initialize() {
  loadInstances();
}

/**
 * Загружает список инстансов из конфигурации
 */
function loadInstances() {
  try {
    const dir = path.dirname(INSTANCES_CONFIG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(INSTANCES_CONFIG_PATH)) {
      const content = fs.readFileSync(INSTANCES_CONFIG_PATH, 'utf-8');
      const data = JSON.parse(content);
      cachedInstances = Array.isArray(data) ? data : [];
    } else {
      // Создаём пустой конфиг
      fs.writeFileSync(INSTANCES_CONFIG_PATH, JSON.stringify([], null, 2), 'utf-8');
      cachedInstances = [];
    }
  } catch (error) {
    logger.logError(`Failed to load instances config: ${error.message}`);
    cachedInstances = [];
  }
}

/**
 * Получает список всех инстансов
 * @returns {Array<Object>} массив инстансов { id, url }
 */
export function listInstances() {
  return [...cachedInstances];
}

/**
 * Получает информацию об инстансе по ID
 * @param {string} instanceId - ID инстанса
 * @returns {Object|null} информация об инстансе или null
 */
export function getInstanceInfo(instanceId) {
  return cachedInstances.find(inst => inst.id === instanceId) || null;
}

/**
 * Валидирует список инстансов
 * @param {Array<Object>} instances - список инстансов
 * @returns {boolean} true если валидный
 */
export function validateInstances(instances) {
  if (!Array.isArray(instances)) {
    return false;
  }

  for (const instance of instances) {
    if (!instance.id || !instance.url) {
      return false;
    }
    
    try {
      new URL(instance.url);
    } catch (error) {
      return false;
    }
  }

  return true;
}

/**
 * Экспорт для использования в других модулях
 */
export default {
  initialize,
  listInstances,
  getInstanceInfo,
  validateInstances
};

