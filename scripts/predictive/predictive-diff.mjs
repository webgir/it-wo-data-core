// Утилиты IWDC v0.6
import * as logger from "../../utils/logger.mjs";

/**
 * Модуль предиктивного diff IWDC v0.8
 * 
 * Выполняет "мягкий" diff с последней успешной версией для предсказания
 * потенциальных проблем ДО основной сборки.
 * 
 * В отличие от обычного diff, предиктивный diff:
 * - Не блокирует сборку
 * - Фокусируется на потенциальных breaking changes
 * - Выявляет риски нарушения целостности
 * - Предупреждает о подозрительных изменениях
 */

/**
 * Глубокое сравнение двух значений (упрощённая версия)
 * @param {any} val1 - первое значение
 * @param {any} val2 - второе значение
 * @returns {boolean} true если значения равны
 */
function deepEqual(val1, val2) {
  if (val1 === val2) {
    return true;
  }
  
  if (val1 === null || val2 === null || val1 === undefined || val2 === undefined) {
    return val1 === val2;
  }
  
  if (typeof val1 !== typeof val2) {
    return false;
  }
  
  if (Array.isArray(val1) && Array.isArray(val2)) {
    if (val1.length !== val2.length) {
      return false;
    }
    return JSON.stringify(val1) === JSON.stringify(val2);
  }
  
  if (typeof val1 === 'object') {
    return JSON.stringify(val1) === JSON.stringify(val2);
  }
  
  return false;
}

/**
 * Анализирует изменения в категории данных
 * @param {Map} currentMap - текущие данные (Map<id, data>)
 * @param {object} previousData - предыдущие данные ({ id: data })
 * @param {string} category - категория (series, models, lengths)
 * @returns {object} Результат анализа изменений
 */
function analyzeCategoryChanges(currentMap, previousData, category) {
  const warnings = [];
  const errors = [];
  
  if (!previousData || !previousData[category]) {
    return { warnings, errors, stats: { added: 0, removed: 0, changed: 0 } };
  }
  
  const previousMap = new Map(Object.entries(previousData[category]));
  const stats = {
    added: 0,
    removed: 0,
    changed: 0,
    suspiciousChanges: 0
  };
  
  // Анализ удалённых сущностей
  for (const [previousId, previousItem] of previousMap.entries()) {
    if (!currentMap.has(previousId)) {
      stats.removed++;
      
      // Критическое предупреждение при удалении
      errors.push({
        type: "ENTITY_REMOVED",
        category: category,
        severity: "error",
        id: previousId,
        slug: previousItem.slug || null,
        message: `Сущность удалена из ${category}: ${previousId}${previousItem.slug ? ` (${previousItem.slug})` : ''}`
      });
    }
  }
  
  // Анализ добавленных и изменённых сущностей
  for (const [currentId, currentItem] of currentMap.entries()) {
    const previousItem = previousMap.get(currentId);
    
    if (!previousItem) {
      // Новая сущность
      stats.added++;
      // Добавление обычно не проблема, но может быть предупреждение при массовом добавлении
    } else {
      // Изменённая сущность - проверяем на подозрительные изменения
      const changes = detectSuspiciousChanges(currentItem, previousItem, category);
      
      if (changes.length > 0) {
        stats.changed++;
        stats.suspiciousChanges++;
        
        // Критичные изменения - ошибки
        const criticalChanges = changes.filter(c => c.severity === 'error');
        errors.push(...criticalChanges);
        
        // Остальные - предупреждения
        const warningChanges = changes.filter(c => c.severity === 'warning');
        warnings.push(...warningChanges);
      } else if (!deepEqual(currentItem, previousItem)) {
        // Есть изменения, но не подозрительные
        stats.changed++;
      }
    }
  }
  
  return { warnings, errors, stats };
}

/**
 * Обнаруживает подозрительные изменения в объекте
 * @param {any} currentItem - текущий объект
 * @param {any} previousItem - предыдущий объект
 * @param {string} category - категория
 * @returns {Array} Массив обнаруженных подозрительных изменений
 */
function detectSuspiciousChanges(currentItem, previousItem, category) {
  const changes = [];
  const allFields = new Set([
    ...Object.keys(currentItem || {}),
    ...Object.keys(previousItem || {})
  ]);
  
  // Список критичных полей, изменение которых может быть breaking change
  const criticalFields = {
    series: ['id', 'slug', 'name'],
    models: ['id', 'slug', 'seriesId', 'model_code'],
    lengths: ['id', 'slug', 'modelId', 'length']
  };
  
  const criticalFieldsForCategory = criticalFields[category] || [];
  
  for (const field of allFields) {
    const currentValue = currentItem[field];
    const previousValue = previousItem[field];
    
    // Пропускаем служебные поля
    if (field === 'meta' || field === 'updated_at' || field === 'data_version') {
      continue;
    }
    
    // Проверка удаления критичного поля
    if (previousValue !== undefined && currentValue === undefined) {
      const isCritical = criticalFieldsForCategory.includes(field);
      changes.push({
        type: "FIELD_REMOVED",
        category: category,
        severity: isCritical ? "error" : "warning",
        field: field,
        id: currentItem.id || currentItem.slug,
        message: `Поле "${field}" удалено из ${category}${isCritical ? ' (критичное поле)' : ''}`
      });
    }
    
    // Проверка изменения типа поля
    if (currentValue !== undefined && previousValue !== undefined) {
      const currentType = typeof currentValue;
      const previousType = typeof previousValue;
      
      if (currentType !== previousType) {
        const isCritical = criticalFieldsForCategory.includes(field);
        changes.push({
          type: "FIELD_TYPE_CHANGED",
          category: category,
          severity: isCritical ? "error" : "warning",
          field: field,
          id: currentItem.id || currentItem.slug,
          previousType: previousType,
          currentType: currentType,
          message: `Тип поля "${field}" изменён в ${category}: ${previousType} → ${currentType}${isCritical ? ' (критичное поле)' : ''}`
        });
      }
    }
    
    // Проверка изменения критичных полей
    if (criticalFieldsForCategory.includes(field)) {
      if (!deepEqual(currentValue, previousValue)) {
        changes.push({
          type: "CRITICAL_FIELD_CHANGED",
          category: category,
          severity: "error",
          field: field,
          id: currentItem.id || currentItem.slug,
          previousValue: previousValue,
          currentValue: currentValue,
          message: `Критичное поле "${field}" изменено в ${category}`
        });
      }
    }
  }
  
  return changes;
}

/**
 * Анализирует риски нарушения связей
 * @param {object} currentData - текущие данные всех категорий
 * @param {object} previousData - предыдущие данные
 * @returns {Array} Массив предупреждений о рисках
 */
function analyzeRelationshipRisks(currentData, previousData) {
  const warnings = [];
  
  if (!previousData) {
    return warnings;
  }
  
  // Проверка моделей: изменение seriesId
  if (currentData.models && previousData.models) {
    const previousModels = new Map(Object.entries(previousData.models));
    
    for (const [modelId, currentModel] of currentData.models.entries()) {
      const previousModel = previousModels.get(modelId);
      
      if (previousModel) {
        const currentSeriesId = currentModel.seriesId || currentModel.series;
        const previousSeriesId = previousModel.seriesId || previousModel.series;
        
        if (currentSeriesId !== previousSeriesId) {
          warnings.push({
            type: "SERIES_ID_CHANGED",
            severity: "error",
            modelId: modelId,
            previousSeriesId: previousSeriesId,
            currentSeriesId: currentSeriesId,
            message: `Модель ${modelId} изменена привязка к серии: ${previousSeriesId} → ${currentSeriesId}`
          });
        }
      }
    }
  }
  
  // Проверка длин: изменение modelId
  if (currentData.lengths && previousData.lengths) {
    const previousLengths = new Map(Object.entries(previousData.lengths));
    
    for (const [lengthId, currentLength] of currentData.lengths.entries()) {
      const previousLength = previousLengths.get(lengthId);
      
      if (previousLength) {
        const currentModelId = currentLength.modelId || currentLength.model;
        const previousModelId = previousLength.modelId || previousLength.model;
        
        if (currentModelId !== previousModelId) {
          warnings.push({
            type: "MODEL_ID_CHANGED",
            severity: "error",
            lengthId: lengthId,
            previousModelId: previousModelId,
            currentModelId: currentModelId,
            message: `Длина ${lengthId} изменена привязка к модели: ${previousModelId} → ${currentModelId}`
          });
        }
      }
    }
  }
  
  return warnings;
}

/**
 * Выполняет предиктивный diff с последней успешной версией
 * @param {object} currentData - текущие данные { series: Map, models: Map, lengths: Map }
 * @param {object} previousData - предыдущие данные { series: {}, models: {}, lengths: {} }
 * @returns {object} Результат предиктивного diff
 */
export async function runPredictiveDiff(currentData, previousData) {
  logger.logInfo('Выполнение предиктивного diff...');
  
  const result = {
    timestamp: new Date().toISOString(),
    warnings: [],
    errors: [],
    stats: {
      series: { added: 0, removed: 0, changed: 0, suspiciousChanges: 0 },
      models: { added: 0, removed: 0, changed: 0, suspiciousChanges: 0 },
      lengths: { added: 0, removed: 0, changed: 0, suspiciousChanges: 0 },
      totalAdded: 0,
      totalRemoved: 0,
      totalChanged: 0,
      totalSuspicious: 0
    }
  };
  
  try {
    const categories = ['series', 'models', 'lengths'];
    
    // Анализ изменений в каждой категории
    for (const category of categories) {
      if (!currentData[category]) {
        continue;
      }
      
      const categoryResult = analyzeCategoryChanges(
        currentData[category],
        previousData,
        category
      );
      
      result.warnings.push(...categoryResult.warnings);
      result.errors.push(...categoryResult.errors);
      result.stats[category] = categoryResult.stats;
      
      result.stats.totalAdded += categoryResult.stats.added;
      result.stats.totalRemoved += categoryResult.stats.removed;
      result.stats.totalChanged += categoryResult.stats.changed;
      result.stats.totalSuspicious += categoryResult.stats.suspiciousChanges;
    }
    
    // Анализ рисков нарушения связей
    const relationshipWarnings = analyzeRelationshipRisks(currentData, previousData);
    result.warnings.push(...relationshipWarnings.filter(w => w.severity === 'warning'));
    result.errors.push(...relationshipWarnings.filter(w => w.severity === 'error'));
    
    logger.logInfo(`Предиктивный diff завершён: +${result.stats.totalAdded} -${result.stats.totalRemoved} ~${result.stats.totalChanged}`);
    logger.logInfo(`Подозрительных изменений: ${result.stats.totalSuspicious}`);
    
    return result;
    
  } catch (error) {
    logger.logError(`Ошибка предиктивного diff: ${error.message}`);
    result.errors.push({
      type: "DIFF_ERROR",
      severity: "critical",
      message: error.message
    });
    throw error;
  }
}

/**
 * Экспорт для использования в других модулях
 */
export default runPredictiveDiff;


