import * as paths from "../../utils/paths.mjs";

/**
 * Конфигурация Security Storage Layer IWDC v0.95
 * 
 * Определяет настройки алгоритмов хеширования, пути и паттерны файлов
 */

/**
 * Алгоритм хеширования
 */
export const HASH_ALGORITHM = "sha256";

/**
 * Версия формата манифеста
 */
export const MANIFEST_VERSION = "1.0";

/**
 * Путь к директории манифестов
 */
export function getManifestsPath() {
  return paths.getSecurityManifestsPath();
}

/**
 * Путь к манифесту версии
 */
export function getManifestPath(versionId) {
  return paths.getSecurityManifestPath(versionId);
}

/**
 * Путь к директории логов безопасности
 */
export function getLogsPath() {
  return paths.getSecurityLogsPath();
}

/**
 * Категории файлов для включения в манифест
 */
export const FILE_CATEGORIES = ["series", "models", "lengths"];

/**
 * Расширения файлов для включения в манифест
 */
export const INCLUDED_EXTENSIONS = [".json"];

/**
 * Проверяет, должен ли файл быть включён в манифест
 * @param {string} filePath - путь к файлу
 * @returns {boolean}
 */
export function shouldIncludeFile(filePath) {
  const normalizedPath = filePath.replace(/\\/g, '/');
  
  // Проверяем категорию
  const hasCategory = FILE_CATEGORIES.some(cat => normalizedPath.includes(`/${cat}/`));
  if (!hasCategory) {
    return false;
  }
  
  // Проверяем расширение
  const hasExtension = INCLUDED_EXTENSIONS.some(ext => filePath.endsWith(ext));
  if (!hasExtension) {
    return false;
  }
  
  return true;
}

/**
 * Экспорт конфигурации по умолчанию
 */
export default {
  HASH_ALGORITHM,
  MANIFEST_VERSION,
  FILE_CATEGORIES,
  INCLUDED_EXTENSIONS,
  getManifestsPath,
  getManifestPath,
  getLogsPath,
  shouldIncludeFile
};


