import path from "path";

/**
 * Утилиты для нормализации путей в IWDC
 * Все пути относительно process.cwd()
 */

/**
 * Получает путь к директории данных JSON
 * @param {string} category - категория (series, models, lengths, seo, meta)
 * @returns {string} Путь к директории
 */
export function getDataJsonPath(category = null) {
  if (category) {
    return path.join(process.cwd(), "data", "json", category);
  }
  return path.join(process.cwd(), "data", "json");
}

/**
 * Получает путь к директории версий
 * @returns {string} Путь к data/versions
 */
export function getVersionsPath() {
  return path.join(process.cwd(), "data", "versions");
}

/**
 * Получает путь к директории конкретной версии
 * @param {string} version - идентификатор версии
 * @returns {string} Путь к data/versions/{version}
 */
export function getVersionPath(version) {
  return path.join(process.cwd(), "data", "versions", version);
}

/**
 * Получает путь к meta.json версии
 * @param {string} version - идентификатор версии
 * @returns {string} Путь к data/versions/{version}/meta.json
 */
export function getVersionMetaPath(version) {
  return path.join(process.cwd(), "data", "versions", version, "meta.json");
}

/**
 * Получает путь к схеме JSON Schema
 * @param {string} schemaName - имя схемы (series, model, length, seo, meta)
 * @returns {string} Путь к schemas/{schemaName}.schema.json
 */
export function getSchemasPath(schemaName) {
  return path.join(process.cwd(), "schemas", `${schemaName}.schema.json`);
}

/**
 * Получает путь к директории diff-файлов
 * @returns {string} Путь к data/diffs
 */
export function getDiffsPath() {
  return path.join(process.cwd(), "data", "diffs");
}

/**
 * Получает путь к директории changelog
 * @returns {string} Путь к data/changelog
 */
export function getChangelogPath() {
  return path.join(process.cwd(), "data", "changelog");
}

/**
 * Получает путь к директории источников XLS
 * @returns {string} Путь к sources/xls
 */
export function getSourcesXlsPath() {
  return path.join(process.cwd(), "sources", "xls");
}

/**
 * Получает путь к директории security manifests
 * @returns {string} Путь к data/security/manifests
 */
export function getSecurityManifestsPath() {
  return path.join(process.cwd(), "data", "security", "manifests");
}

/**
 * Получает путь к манифесту версии
 * @param {string} versionId - идентификатор версии
 * @returns {string} Путь к data/security/manifests/manifest-{versionId}.json
 */
export function getSecurityManifestPath(versionId) {
  return path.join(process.cwd(), "data", "security", "manifests", `manifest-${versionId}.json`);
}

/**
 * Получает путь к директории security logs
 * @returns {string} Путь к logs/security
 */
export function getSecurityLogsPath() {
  return path.join(process.cwd(), "logs", "security");
}

