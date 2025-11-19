import fs from "fs";
import path from "path";
import * as config from "./integrity-config.mjs";
import * as logger from "../../utils/logger.mjs";

/**
 * Модуль логирования безопасности IWDC v0.95
 * 
 * Записывает события Security Layer в logs/security/
 */

/**
 * Записывает запись в security log
 * @param {object} entry - объект записи
 * @param {string} entry.action - действие (build-manifest, verify, error)
 * @param {string} entry.version - версия
 * @param {string} entry.status - статус (ok, warning, error)
 * @param {object} entry.details - дополнительные детали
 */
export function writeSecurityLogEntry(entry) {
  try {
    const logsDir = config.getLogsPath();
    
    // Создаём директорию, если её нет
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    // Формируем имя файла с датой
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const logFile = path.join(logsDir, `${today}.log`);
    
    // Формируем запись
    const logEntry = {
      timestamp: new Date().toISOString(),
      action: entry.action || "unknown",
      version: entry.version || null,
      status: entry.status || "unknown",
      details: entry.details || {}
    };
    
    // Форматируем для записи
    const logLine = JSON.stringify(logEntry) + '\n';
    
    // Записываем в файл (append mode)
    fs.appendFileSync(logFile, logLine, 'utf-8');
    
  } catch (error) {
    // Не используем logger, чтобы избежать циклических зависимостей
    console.error(`Ошибка записи security log: ${error.message}`);
  }
}

/**
 * Экспорт для использования в других модулях
 */
export default {
  writeSecurityLogEntry
};


