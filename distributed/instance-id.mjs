import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import * as logger from "../utils/logger.mjs";

/**
 * Instance Identity Layer IWDC v1.4
 * 
 * Управление уникальным идентификатором экземпляра IWDC.
 */

/**
 * Путь к файлу с instanceId
 */
const INSTANCE_ID_PATH = path.join(process.cwd(), 'data', 'distributed', 'instance.json');

/**
 * Кэш instanceId
 */
let cachedInstanceId = null;

/**
 * Получает или создаёт instanceId
 * @returns {string} instanceId (UUID v4)
 */
export function getInstanceId() {
  if (cachedInstanceId) {
    return cachedInstanceId;
  }

  // Создаём директорию, если не существует
  const dir = path.dirname(INSTANCE_ID_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Пытаемся прочитать существующий instanceId
  if (fs.existsSync(INSTANCE_ID_PATH)) {
    try {
      const content = fs.readFileSync(INSTANCE_ID_PATH, 'utf-8');
      const data = JSON.parse(content);
      
      if (data.instanceId && typeof data.instanceId === 'string') {
        cachedInstanceId = data.instanceId;
        logger.logInfo(`Instance ID loaded: ${cachedInstanceId}`);
        return cachedInstanceId;
      }
    } catch (error) {
      logger.logWarning(`Failed to read instance ID: ${error.message}`);
    }
  }

  // Создаём новый instanceId
  cachedInstanceId = randomUUID();
  
  // Сохраняем в файл
  try {
    const data = {
      instanceId: cachedInstanceId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    fs.writeFileSync(INSTANCE_ID_PATH, JSON.stringify(data, null, 2), 'utf-8');
    logger.logSuccess(`Instance ID created: ${cachedInstanceId}`);
  } catch (error) {
    logger.logError(`Failed to save instance ID: ${error.message}`);
    throw error;
  }

  return cachedInstanceId;
}

/**
 * Получает метаданные экземпляра
 * @returns {Object} метаданные { instanceId, createdAt, updatedAt }
 */
export function getInstanceMetadata() {
  if (!fs.existsSync(INSTANCE_ID_PATH)) {
    // Если файла нет, создаём instanceId
    getInstanceId();
  }

  try {
    const content = fs.readFileSync(INSTANCE_ID_PATH, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    logger.logError(`Failed to read instance metadata: ${error.message}`);
    return {
      instanceId: getInstanceId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }
}

/**
 * Экспорт для использования в других модулях
 */
export default {
  getInstanceId,
  getInstanceMetadata
};

