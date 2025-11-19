// Утилиты IWDC v0.6
import * as paths from "../../utils/paths.mjs";
import { loadJsonMap } from "../../utils/file.mjs";
import { getLatestVersion } from "../snapshot-version.mjs";

/**
 * Получает slug из объекта (для проверки изменения ID)
 */
function getSlug(item) {
  return item.slug || item.entity_slug || null;
}

/**
 * Сравнивает типы двух значений
 */
function compareTypes(value1, value2) {
  const type1 = typeof value1;
  const type2 = typeof value2;
  
  // Специальная обработка для null и undefined
  if (value1 === null || value1 === undefined) {
    return (value2 === null || value2 === undefined);
  }
  if (value2 === null || value2 === undefined) {
    return false;
  }
  
  // Проверка массивов
  if (Array.isArray(value1) && Array.isArray(value2)) {
    return true;
  }
  if (Array.isArray(value1) || Array.isArray(value2)) {
    return false;
  }
  
  // Проверка объектов
  if (type1 === 'object' && type2 === 'object') {
    return true;
  }
  
  return type1 === type2;
}

export async function run(options = {}) {
  const errors = [];
  const warnings = [];
  
  // Загрузка текущих данных
  // Загружаем текущие данные (используем пути из utils)
  const currentSeries = loadJsonMap(paths.getDataJsonPath("series"));
  const currentModels = loadJsonMap(paths.getDataJsonPath("models"));
  const currentLengths = loadJsonMap(paths.getDataJsonPath("lengths"));
  
  // Получение предыдущей версии
  const lastVersion = getLatestVersion();
  
  if (!lastVersion) {
    // Нет предыдущей версии - возвращаем ok
    return {
      scope: "bc-validator",
      status: "ok",
      errors: [],
      warnings: [],
      stats: {
        added: 0,
        removed: 0,
        changed: 0
      }
    };
  }
  
  // Загрузка предыдущих данных (используем пути из utils)
  const versionPath = paths.getVersionPath(lastVersion);
  const previousSeriesPath = path.join(versionPath, "json", "series");
  const previousModelsPath = path.join(versionPath, "json", "models");
  const previousLengthsPath = path.join(versionPath, "json", "lengths");
  const previousSeries = loadJsonMap(previousSeriesPath);
  const previousModels = loadJsonMap(previousModelsPath);
  const previousLengths = loadJsonMap(previousLengthsPath);
  
  const stats = {
    added: 0,
    removed: 0,
    changed: 0
  };
  
  // Вспомогательная функция для сравнения сущностей
  function compareEntities(currentMap, previousMap, entityType) {
    // A) Удалённые сущности
    for (const [id, previousItem] of previousMap.entries()) {
      if (!currentMap.has(id)) {
        errors.push({
          type: "REMOVED_ENTITY",
          entity: entityType,
          id: id
        });
        stats.removed++;
      }
    }
    
    // B) Изменение ID и C) Проверка типов, D) Удаление полей
    for (const [id, currentItem] of currentMap.entries()) {
      const previousItem = previousMap.get(id);
      
      if (!previousItem) {
        // Новая сущность
        stats.added++;
        continue;
      }
      
      // B) Проверка изменения ID через slug
      const currentSlug = getSlug(currentItem);
      const previousSlug = getSlug(previousItem);
      
      if (currentSlug && previousSlug && currentSlug === previousSlug) {
        // Slug совпадает, но ID может отличаться
        if (currentItem.id !== previousItem.id) {
          errors.push({
            type: "CHANGED_ID",
            oldId: previousItem.id,
            newId: currentItem.id,
            slug: currentSlug
          });
        }
      }
      
      // C) Проверка типов полей
      const allFields = new Set([
        ...Object.keys(currentItem),
        ...Object.keys(previousItem)
      ]);
      
      for (const field of allFields) {
        const currentValue = currentItem[field];
        const previousValue = previousItem[field];
        
        // Пропускаем служебные поля
        if (field === 'meta' || field === 'updated_at' || field === 'data_version') {
          continue;
        }
        
        // D) Удаление требуемого поля
        if (previousValue !== undefined && currentValue === undefined) {
          errors.push({
            type: "REMOVED_REQUIRED_FIELD",
            id: id,
            field: field,
            entity: entityType
          });
        }
        
        // C) Изменение типа поля
        if (currentValue !== undefined && previousValue !== undefined) {
          if (!compareTypes(currentValue, previousValue)) {
            errors.push({
              type: "TYPE_CHANGED",
              id: id,
              field: field,
              entity: entityType,
              oldType: typeof previousValue,
              newType: typeof currentValue
            });
          }
        }
      }
      
      // Если были изменения (но не ошибки), считаем как changed
      if (previousItem) {
        stats.changed++;
      }
    }
  }
  
  // Сравнение для каждого типа сущностей
  compareEntities(currentSeries, previousSeries, "series");
  compareEntities(currentModels, previousModels, "model");
  compareEntities(currentLengths, previousLengths, "length");
  
  return {
    scope: "bc-validator",
    status: errors.length > 0 ? "error" : "ok",
    errors: errors,
    warnings: warnings,
    stats: stats
  };
}
