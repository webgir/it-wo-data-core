import { getVersionMetaPath } from "./paths.mjs";
import { readJsonFile } from "./file.mjs";
import fs from "fs";

/**
 * Загружает полный meta.json версии
 * @param {string} version - идентификатор версии
 * @returns {object | null} Объект meta или null если версия не найдена
 */
export function loadMetaVersion(version) {
  const metaPath = getVersionMetaPath(version);
  
  if (!fs.existsSync(metaPath)) {
    return null;
  }
  
  try {
    return readJsonFile(metaPath);
  } catch (error) {
    return null;
  }
}


