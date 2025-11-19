import { getVersionMetaPath } from "./paths.mjs";
import { readJsonFile } from "./file.mjs";
import fs from "fs";

/**
 * Загружает integrity из meta.json версии
 * @param {string} version - идентификатор версии
 * @returns {{ integrity: object, meta: object } | null} Объект с integrity и meta, или null если версия не найдена
 */
export function loadIntegrityFromVersion(version) {
  const metaPath = getVersionMetaPath(version);
  
  if (!fs.existsSync(metaPath)) {
    return null;
  }
  
  try {
    const meta = readJsonFile(metaPath);
    return {
      integrity: meta.integrity || {},
      meta: meta
    };
  } catch (error) {
    // Если не удалось загрузить, возвращаем null
    return null;
  }
}


