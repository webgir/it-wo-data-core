import fs from "fs";
import path from "path";
import * as config from "./integrity-config.mjs";
import { hashFile, hashTree } from "./hash-utils.mjs";
import * as paths from "../../utils/paths.mjs";
import { readJsonFile } from "../../utils/file.mjs";
import * as logger from "../../utils/logger.mjs";

/**
 * Модуль верификации манифестов целостности IWDC v0.95
 * 
 * Проверяет соответствие фактических файлов манифесту
 */

/**
 * Загружает манифест версии
 * @param {string} versionId - идентификатор версии
 * @returns {object|null} Объект манифеста или null
 */
export function loadIntegrityManifest(versionId) {
  const manifestPath = config.getManifestPath(versionId);
  
  if (!fs.existsSync(manifestPath)) {
    return null;
  }
  
  try {
    return readJsonFile(manifestPath);
  } catch (error) {
    throw new Error(`Ошибка загрузки манифеста ${manifestPath}: ${error.message}`);
  }
}

/**
 * Рекурсивно сканирует директорию и собирает файлы
 * @param {string} dirPath - путь к директории
 * @param {string} basePath - базовый путь для относительных путей
 * @returns {Array} Массив путей к файлам
 */
function scanDirectory(dirPath, basePath = null) {
  const files = [];
  const base = basePath || dirPath;
  
  if (!fs.existsSync(dirPath)) {
    return files;
  }
  
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    
    if (entry.isDirectory()) {
      files.push(...scanDirectory(fullPath, base));
    } else if (entry.isFile()) {
      const relativePath = path.relative(base, fullPath).replace(/\\/g, '/');
      if (config.shouldIncludeFile(relativePath)) {
        files.push(fullPath);
      }
    }
  }
  
  return files;
}

/**
 * Верифицирует целостность версии
 * @param {string} versionId - идентификатор версии
 * @returns {object} Результат верификации
 */
export function verifyIntegrity(versionId) {
  const result = {
    version: versionId,
    timestamp: new Date().toISOString(),
    status: "ok",
    mismatches: [],
    missing: [],
    extra: [],
    verified: 0,
    total: 0
  };
  
  // Загружаем манифест
  const manifest = loadIntegrityManifest(versionId);
  
  if (!manifest) {
    result.status = "error";
    result.error = `Манифест для версии ${versionId} не найден`;
    return result;
  }
  
  logger.logInfo(`Верификация версии: ${versionId}`);
  logger.logInfo(`Манифест содержит ${manifest.files.length} файлов`);
  
  // Получаем путь к версии
  const versionPath = paths.getVersionPath(versionId);
  
  if (!fs.existsSync(versionPath)) {
    result.status = "error";
    result.error = `Версия ${versionId} не найдена: ${versionPath}`;
    return result;
  }
  
  // Сканируем фактические файлы
  const actualFiles = scanDirectory(versionPath, versionPath);
  const actualFilesMap = new Map();
  
  for (const filePath of actualFiles) {
    const relativePath = path.relative(versionPath, filePath).replace(/\\/g, '/');
    actualFilesMap.set(relativePath, filePath);
  }
  
  // Создаём карту файлов из манифеста
  const manifestFilesMap = new Map();
  for (const fileEntry of manifest.files) {
    manifestFilesMap.set(fileEntry.path, fileEntry);
  }
  
  // Проверяем файлы из манифеста
  for (const [filePath, fileEntry] of manifestFilesMap.entries()) {
    result.total++;
    
    const actualFilePath = actualFilesMap.get(filePath);
    
    if (!actualFilePath) {
      // Файл есть в манифесте, но отсутствует на диске
      result.missing.push({
        path: filePath,
        expectedHash: fileEntry.hash,
        expectedSize: fileEntry.size
      });
      continue;
    }
    
    // Вычисляем хеш фактического файла
    try {
      const { hash, size } = hashFile(actualFilePath);
      
      if (hash !== fileEntry.hash) {
        // Хеш не совпадает
        result.mismatches.push({
          path: filePath,
          expectedHash: fileEntry.hash,
          actualHash: hash,
          expectedSize: fileEntry.size,
          actualSize: size
        });
      } else {
        result.verified++;
      }
    } catch (error) {
      result.mismatches.push({
        path: filePath,
        error: error.message
      });
    }
  }
  
  // Проверяем лишние файлы (есть на диске, но нет в манифесте)
  for (const [filePath, actualFilePath] of actualFilesMap.entries()) {
    if (!manifestFilesMap.has(filePath)) {
      result.extra.push({
        path: filePath
      });
    }
  }
  
  // Определяем статус
  if (result.mismatches.length > 0 || result.missing.length > 0) {
    result.status = "error";
  } else if (result.extra.length > 0) {
    result.status = "warning";
  }
  
  // Логируем результаты
  if (result.status === "ok") {
    logger.logSuccess(`Верификация успешна: ${result.verified}/${result.total} файлов`);
  } else if (result.status === "error") {
    logger.logError(`Верификация не прошла: ${result.mismatches.length} несовпадений, ${result.missing.length} отсутствующих`);
  } else {
    logger.logWarning(`Верификация с предупреждениями: ${result.extra.length} лишних файлов`);
  }
  
  return result;
}

/**
 * Экспорт для использования в других модулях
 */
export default {
  loadIntegrityManifest,
  verifyIntegrity
};


