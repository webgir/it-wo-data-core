import { getVersionMetaPath } from "./paths.mjs";
import { writeJsonFile } from "./file.mjs";

/**
 * Сохраняет meta.json версии
 * @param {string} version - идентификатор версии
 * @param {object} meta - объект meta для сохранения
 */
export function saveMetaVersion(version, meta) {
  const metaPath = getVersionMetaPath(version);
  writeJsonFile(metaPath, meta);
}


