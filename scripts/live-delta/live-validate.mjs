import Ajv from "ajv";
import addFormats from "ajv-formats";
import fs from "fs";
import path from "path";
// Утилиты IWDC v0.6
import * as paths from "../../utils/paths.mjs";
import { readJsonFile } from "../../utils/file.mjs";
import * as logger from "../../utils/logger.mjs";

/**
 * Модуль валидации файлов в реальном времени IWDC v0.9
 * 
 * Выполняет валидацию изменённого файла:
 * - JSON Schema валидация
 * - Предиктивные проверки через Predictive Layer
 */

// Загрузка и компиляция схем
let validators = null;

function loadValidators() {
  if (validators) {
    return validators;
  }
  
  const seriesSchema = readJsonFile(paths.getSchemasPath("series"));
  const modelSchema = readJsonFile(paths.getSchemasPath("model"));
  const lengthSchema = readJsonFile(paths.getSchemasPath("length"));
  
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  
  validators = {
    series: ajv.compile(seriesSchema),
    model: ajv.compile(modelSchema),
    length: ajv.compile(lengthSchema)
  };
  
  return validators;
}

/**
 * Определяет категорию файла по пути
 * Возвращает категорию для использования в validators: 'series', 'model', 'length'
 */
function getCategoryFromPath(filePath) {
  const normalizedPath = filePath.replace(/\\/g, '/');
  if (normalizedPath.includes('/series/')) {
    return 'series';
  } else if (normalizedPath.includes('/models/')) {
    return 'model';
  } else if (normalizedPath.includes('/lengths/')) {
    return 'length';
  }
  return null;
}

/**
 * Преобразует категорию валидатора в категорию данных
 * 'series' -> 'series', 'model' -> 'models', 'length' -> 'lengths'
 */
function getDataCategory(validatorCategory) {
  if (validatorCategory === 'series') return 'series';
  if (validatorCategory === 'model') return 'models';
  if (validatorCategory === 'length') return 'lengths';
  return validatorCategory;
}

/**
 * Выполняет валидацию файла
 * @param {string} filePath - путь к файлу
 * @returns {object} Результат валидации
 */
export async function runLiveValidation(filePath) {
  const result = {
    file: filePath,
    timestamp: new Date().toISOString(),
    status: "ok",
    errors: [],
    warnings: [],
    category: null
  };
  
  try {
    // Определяем категорию валидатора
    const validatorCategory = getCategoryFromPath(filePath);
    
    if (!validatorCategory) {
      result.status = "error";
      result.errors.push({
        type: "UNKNOWN_CATEGORY",
        message: `Не удалось определить категорию файла: ${filePath}`
      });
      return result;
    }
    
    // Сохраняем категорию данных для предиктивных проверок
    result.category = getDataCategory(validatorCategory);
    
    // Загружаем файл
    if (!fs.existsSync(filePath)) {
      result.status = "error";
      result.errors.push({
        type: "FILE_NOT_FOUND",
        message: `Файл не найден: ${filePath}`
      });
      return result;
    }
    
    let fileData;
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      fileData = JSON.parse(content);
    } catch (parseError) {
      result.status = "error";
      result.errors.push({
        type: "JSON_PARSE_ERROR",
        message: `Ошибка парсинга JSON: ${parseError.message}`
      });
      return result;
    }
    
    // Загружаем валидаторы
    const validators = loadValidators();
    const validator = validators[validatorCategory];
    
    if (!validator) {
      result.status = "error";
      result.errors.push({
        type: "VALIDATOR_NOT_FOUND",
        message: `Валидатор не найден для категории: ${validatorCategory}`
      });
      return result;
    }
    
    // JSON Schema валидация
    const isValid = validator(fileData);
    
    if (!isValid) {
      result.status = "error";
      result.errors.push(...validator.errors.map(err => ({
        type: "SCHEMA_VALIDATION_ERROR",
        field: err.instancePath || err.params?.missingProperty || 'root',
        message: err.message,
        schemaPath: err.schemaPath
      })));
    }
    
    // Предиктивные проверки (если файл валиден по схеме)
    if (isValid) {
      try {
        const predictiveWarnings = await runPredictiveChecks(filePath, fileData, result.category);
        result.warnings.push(...predictiveWarnings);
        
        if (predictiveWarnings.length > 0) {
          result.status = "warning";
        }
      } catch (predictiveError) {
        // Ошибки предиктивных проверок не критичны
        result.warnings.push({
          type: "PREDICTIVE_CHECK_ERROR",
          message: `Ошибка предиктивных проверок: ${predictiveError.message}`
        });
      }
    }
    
    return result;
    
  } catch (error) {
    result.status = "error";
    result.errors.push({
      type: "VALIDATION_ERROR",
      message: error.message
    });
    return result;
  }
}

/**
 * Выполняет предиктивные проверки через Predictive Layer
 */
async function runPredictiveChecks(filePath, fileData, category) {
  const warnings = [];
  
  try {
    // Загружаем текущие данные для контекста
    const { loadJsonMap } = await import("../../utils/file.mjs");
    const currentData = {
      series: loadJsonMap(paths.getDataJsonPath("series")),
      models: loadJsonMap(paths.getDataJsonPath("models")),
      lengths: loadJsonMap(paths.getDataJsonPath("lengths"))
    };
    
    // Проверка консистентности ID/slug (упрощённая версия)
    const id = fileData.id || fileData.slug;
    if (id) {
      // category уже в правильном формате: 'series', 'models', 'lengths'
      const categoryMap = currentData[category] || new Map();
      
      // Проверка на дубликаты ID
      let duplicateCount = 0;
      for (const [existingId, existingData] of categoryMap.entries()) {
        const existingItemId = existingData.id || existingData.slug;
        if (existingItemId === id && existingId !== filePath) {
          duplicateCount++;
        }
      }
      
      if (duplicateCount > 0) {
        warnings.push({
          type: "POTENTIAL_DUPLICATE_ID",
          message: `Возможный дубликат ID "${id}" в ${category}`
        });
      }
    }
    
    // Проверка связей (для models и lengths)
    if (category === 'models' && fileData.seriesId) {
      const seriesMap = currentData.series;
      if (!seriesMap.has(fileData.seriesId)) {
        warnings.push({
          type: "MISSING_SERIES_REFERENCE",
          message: `Модель ссылается на несуществующую серию: ${fileData.seriesId}`
        });
      }
    }
    
    if (category === 'lengths' && fileData.modelId) {
      const modelsMap = currentData.models;
      if (!modelsMap.has(fileData.modelId)) {
        warnings.push({
          type: "MISSING_MODEL_REFERENCE",
          message: `Длина ссылается на несуществующую модель: ${fileData.modelId}`
        });
      }
    }
    
  } catch (error) {
    // Игнорируем ошибки предиктивных проверок
  }
  
  return warnings;
}

/**
 * Экспорт для использования в других модулях
 */
export default runLiveValidation;

