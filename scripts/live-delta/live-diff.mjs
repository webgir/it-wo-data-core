import fs from "fs";
import path from "path";
// Утилиты IWDC v0.6
import * as paths from "../../utils/paths.mjs";
import { readJsonFile } from "../../utils/file.mjs";
import { loadRecoveryState } from "../recovery/state.mjs";
import { loadPreviousSnapshot } from "../../utils/loadPreviousSnapshot.mjs";
import * as logger from "../../utils/logger.mjs";

/**
 * Модуль построения diff для изменённого файла IWDC v0.9
 * 
 * Выполняет diff изменённого файла с предыдущим snapshot:
 * - Определяет категорию файла
 * - Загружает соответствующую версию из snapshot
 * - Сравнивает и выявляет изменения
 */

/**
 * Определяет категорию файла по пути
 */
function getCategoryFromPath(filePath) {
  const normalizedPath = filePath.replace(/\\/g, '/');
  if (normalizedPath.includes('/series/')) {
    return 'series';
  } else if (normalizedPath.includes('/models/')) {
    return 'models';
  } else if (normalizedPath.includes('/lengths/')) {
    return 'lengths';
  }
  return null;
}

/**
 * Получает ID объекта в зависимости от категории
 */
function getId(obj, category) {
  if (category === 'series') {
    return obj.id || obj.series || obj.slug || null;
  } else if (category === 'models') {
    return obj.id || obj.slug || obj.model_code || null;
  } else if (category === 'lengths') {
    return obj.id || obj.slug || null;
  }
  return obj.id || obj.slug || null;
}

/**
 * Глубокое сравнение двух объектов (упрощённая версия)
 */
function deepEqual(obj1, obj2) {
  return JSON.stringify(obj1) === JSON.stringify(obj2);
}

/**
 * Сравнивает два объекта и возвращает изменения
 */
function compareObjects(current, previous) {
  const changes = {
    added: [],
    removed: [],
    changed: []
  };
  
  const allKeys = new Set([
    ...Object.keys(current || {}),
    ...Object.keys(previous || {})
  ]);
  
  // Пропускаем служебные поля
  const skipFields = ['meta', 'updated_at', 'data_version'];
  
  for (const key of allKeys) {
    if (skipFields.includes(key)) {
      continue;
    }
    
    const currentValue = current?.[key];
    const previousValue = previous?.[key];
    
    if (currentValue === undefined && previousValue !== undefined) {
      changes.removed.push({
        key: key,
        previousValue: previousValue
      });
    } else if (currentValue !== undefined && previousValue === undefined) {
      changes.added.push({
        key: key,
        currentValue: currentValue
      });
    } else if (!deepEqual(currentValue, previousValue)) {
      changes.changed.push({
        key: key,
        previousValue: previousValue,
        currentValue: currentValue
      });
    }
  }
  
  return changes;
}

/**
 * Строит diff для изменённого файла
 * @param {string} filePath - путь к изменённому файлу
 * @returns {object} Результат diff
 */
export async function buildLiveDiff(filePath) {
  const result = {
    file: filePath,
    timestamp: new Date().toISOString(),
    status: "ok",
    category: null,
    previousVersion: null,
    changes: {
      added: [],
      removed: [],
      changed: []
    },
    entityStatus: "unknown" // new, modified, unchanged
  };
  
  try {
    // Определяем категорию
    result.category = getCategoryFromPath(filePath);
    
    if (!result.category) {
      result.status = "error";
      result.error = `Не удалось определить категорию файла: ${filePath}`;
      return result;
    }
    
    // Загружаем текущий файл
    if (!fs.existsSync(filePath)) {
      result.status = "error";
      result.error = `Файл не найден: ${filePath}`;
      return result;
    }
    
    let currentData;
    try {
      currentData = readJsonFile(filePath);
    } catch (parseError) {
      result.status = "error";
      result.error = `Ошибка парсинга JSON: ${parseError.message}`;
      return result;
    }
    
    // Получаем последнюю успешную версию
    const recoveryState = loadRecoveryState();
    const lastSuccessfulVersion = recoveryState.lastSuccessfulVersion;
    
    if (!lastSuccessfulVersion) {
      result.status = "limited";
      result.warning = "Последняя успешная версия не найдена, diff невозможен";
      result.entityStatus = "new";
      return result;
    }
    
    result.previousVersion = lastSuccessfulVersion;
    
    // Загружаем данные предыдущей версии
    const previousData = loadPreviousSnapshot(lastSuccessfulVersion);
    
    if (!previousData || !previousData[result.category]) {
      result.status = "limited";
      result.warning = `Данные категории ${result.category} не найдены в версии ${lastSuccessfulVersion}`;
      result.entityStatus = "new";
      return result;
    }
    
    // Получаем ID текущего объекта
    const currentId = getId(currentData, result.category);
    
    if (!currentId) {
      result.status = "error";
      result.error = "Не удалось определить ID объекта";
      return result;
    }
    
    // Ищем объект в предыдущей версии
    const previousCategoryData = previousData[result.category];
    const previousItem = previousCategoryData[currentId];
    
    if (!previousItem) {
      // Новый объект
      result.entityStatus = "new";
      result.changes.added.push({
        message: "Новая сущность",
        data: currentData
      });
    } else {
      // Сравниваем объекты
      const objectChanges = compareObjects(currentData, previousItem);
      
      if (objectChanges.added.length === 0 && 
          objectChanges.removed.length === 0 && 
          objectChanges.changed.length === 0) {
        result.entityStatus = "unchanged";
      } else {
        result.entityStatus = "modified";
        result.changes = objectChanges;
      }
    }
    
    return result;
    
  } catch (error) {
    result.status = "error";
    result.error = error.message;
    return result;
  }
}

/**
 * Экспорт для использования в других модулях
 */
export default buildLiveDiff;

