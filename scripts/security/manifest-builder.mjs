import fs from "fs";
import path from "path";
import * as config from "./integrity-config.mjs";
import { hashFile, hashTree } from "./hash-utils.mjs";
import * as paths from "../../utils/paths.mjs";
import * as logger from "../../utils/logger.mjs";
import { readJsonFile, writeJsonFile } from "../../utils/file.mjs";

/**
 * Модуль построения манифестов целостности IWDC v0.95
 * 
 * Создаёт манифесты для snapshot-версий с хешами всех файлов
 */

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
 * Строит манифест целостности для версии
 * @param {string} versionId - идентификатор версии
 * @returns {object} Объект манифеста
 */
export function buildIntegrityManifest(versionId) {
  const versionPath = paths.getVersionPath(versionId);
  
  if (!fs.existsSync(versionPath)) {
    throw new Error(`Версия ${versionId} не найдена: ${versionPath}`);
  }
  
  logger.logInfo(`Построение манифеста для версии: ${versionId}`);
  
  // Сканируем все файлы в версии
  const allFiles = scanDirectory(versionPath, versionPath);
  
  logger.logInfo(`Найдено файлов: ${allFiles.length}`);
  
  // Хешируем каждый файл
  const fileEntries = [];
  for (const filePath of allFiles) {
    try {
      const { hash, size } = hashFile(filePath);
      const relativePath = path.relative(versionPath, filePath).replace(/\\/g, '/');
      
      // Определяем тип файла по категории
      let fileType = "unknown";
      if (relativePath.includes('/series/')) {
        fileType = "series";
      } else if (relativePath.includes('/models/')) {
        fileType = "models";
      } else if (relativePath.includes('/lengths/')) {
        fileType = "lengths";
      }
      
      fileEntries.push({
        path: relativePath,
        hash: hash,
        size: size,
        type: fileType
      });
    } catch (error) {
      logger.logWarning(`Ошибка хеширования файла ${filePath}: ${error.message}`);
    }
  }
  
  // Строим корневой хеш дерева
  const rootHash = hashTree(fileEntries);
  
  // Формируем манифест
  const manifest = {
    version: versionId,
    createdAt: new Date().toISOString(),
    algorithm: config.HASH_ALGORITHM,
    manifestVersion: config.MANIFEST_VERSION,
    root: rootHash,
    files: fileEntries.sort((a, b) => a.path.localeCompare(b.path))
  };
  
  logger.logSuccess(`Манифест построен: ${fileEntries.length} файлов, root hash: ${rootHash.substring(0, 16)}...`);
  
  return manifest;
}

/**
 * Сохраняет манифест в файл
 * @param {string} versionId - идентификатор версии
 * @param {object} manifest - объект манифеста
 */
export function saveIntegrityManifest(versionId, manifest) {
  const manifestPath = config.getManifestPath(versionId);
  const manifestsDir = path.dirname(manifestPath);
  
  // Создаём директорию, если её нет
  if (!fs.existsSync(manifestsDir)) {
    fs.mkdirSync(manifestsDir, { recursive: true });
  }
  
  // Сохраняем манифест
  writeJsonFile(manifestPath, manifest);
  
  logger.logSuccess(`Манифест сохранён: ${manifestPath}`);
  
  return manifestPath;
}

/**
 * Экспорт для использования в других модулях
 */
export default {
  buildIntegrityManifest,
  saveIntegrityManifest
};


