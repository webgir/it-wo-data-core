import { getVersionPath } from "./paths.mjs";
import fs from "fs";
import path from "path";

/**
 * Получает ID объекта в зависимости от категории
 * @param {any} obj - объект
 * @param {string} category - категория (series, models, lengths)
 * @returns {string | null} ID объекта
 */
function getId(obj, category) {
  if (category === 'series') {
    return obj.series || obj.slug || obj.id;
  } else if (category === 'models') {
    return obj.slug || obj.model_code || obj.id;
  } else if (category === 'lengths') {
    return obj.slug || obj.id;
  }
  return obj.id || obj.slug;
}

/**
 * Загружает данные версии из директории по категории
 * @param {string} versionPath - путь к директории версии
 * @param {string} category - категория (series, models, lengths)
 * @returns {object} Объект с данными { id: data }
 */
function loadVersionData(versionPath, category) {
  const categoryPath = path.join(versionPath, category);
  const data = {};
  
  if (!fs.existsSync(categoryPath)) {
    return data;
  }
  
  const entries = fs.readdirSync(categoryPath, { withFileTypes: true });
  
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.json')) {
      const filePath = path.join(categoryPath, entry.name);
      try {
        const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const id = getId(content, category);
        if (id) {
          data[id] = content;
        }
      } catch (error) {
        // Пропускаем файлы с ошибками
      }
    }
  }
  
  return data;
}

/**
 * Загружает предыдущий snapshot по версии и категории
 * @param {string} version - идентификатор версии
 * @param {string} category - категория (series, models, lengths) или null для всех
 * @returns {object | null} Данные snapshot или null если версия не найдена
 */
export function loadPreviousSnapshot(version, category = null) {
  const versionPath = getVersionPath(version);
  
  if (!fs.existsSync(versionPath)) {
    return null;
  }
  
  if (category) {
    return loadVersionData(versionPath, category);
  }
  
  // Если категория не указана, возвращаем все данные
  return {
    series: loadVersionData(versionPath, 'series'),
    models: loadVersionData(versionPath, 'models'),
    lengths: loadVersionData(versionPath, 'lengths')
  };
}


