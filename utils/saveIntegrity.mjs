import { getVersionMetaPath } from "./paths.mjs";
import { readJsonFile, writeJsonFile } from "./file.mjs";
import fs from "fs";

/**
 * Сохраняет integrity в meta.json версии
 * Обновляет существующий meta.json или создаёт новый
 * @param {string} version - идентификатор версии
 * @param {object} integrity - объект integrity для сохранения
 */
export function saveIntegrityToVersion(version, integrity) {
  const metaPath = getVersionMetaPath(version);
  
  let meta = {};
  
  // Загружаем существующий meta.json, если есть
  if (fs.existsSync(metaPath)) {
    try {
      meta = readJsonFile(metaPath);
    } catch (error) {
      // Если не удалось загрузить, создаём новый
      meta = {};
    }
  }
  
  // Обновляем integrity
  meta.integrity = integrity;
  
  // Сохраняем
  writeJsonFile(metaPath, meta);
}


