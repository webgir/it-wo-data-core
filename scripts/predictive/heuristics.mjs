// Утилиты IWDC v0.6
import * as logger from "../../utils/logger.mjs";

/**
 * Модуль эвристического анализа данных IWDC v0.8
 * 
 * Эвристики выявляют потенциальные проблемы на основе паттернов:
 * - Аномальные изменения в количестве сущностей
 * - Подозрительные паттерны в данных
 * - Риски нарушения целостности
 * - Предупреждения о возможных breaking changes
 */

/**
 * Анализирует изменения в количестве сущностей
 * @param {Map} currentMap - текущие данные (Map<id, data>)
 * @param {object} previousData - предыдущие данные ({ id: data })
 * @param {string} category - категория (series, models, lengths)
 * @returns {Array} Массив предупреждений
 */
function analyzeEntityCountChanges(currentMap, previousData, category) {
  const warnings = [];
  
  if (!previousData || !previousData[category]) {
    return warnings;
  }
  
  const currentCount = currentMap.size;
  const previousCount = Object.keys(previousData[category]).length;
  const change = currentCount - previousCount;
  const changePercent = previousCount > 0 ? (change / previousCount) * 100 : 0;
  
  // Предупреждение при значительном изменении количества
  if (Math.abs(changePercent) > 50) {
    warnings.push({
      type: "SIGNIFICANT_COUNT_CHANGE",
      category: category,
      severity: "warning",
      current: currentCount,
      previous: previousCount,
      change: change,
      changePercent: changePercent.toFixed(1),
      message: `Значительное изменение количества ${category}: ${previousCount} → ${currentCount} (${changePercent > 0 ? '+' : ''}${changePercent.toFixed(1)}%)`
    });
  }
  
  // Критическое предупреждение при массовом удалении
  if (changePercent < -30) {
    warnings.push({
      type: "MASS_REMOVAL",
      category: category,
      severity: "error",
      current: currentCount,
      previous: previousCount,
      removed: Math.abs(change),
      message: `Массовое удаление ${category}: удалено ${Math.abs(change)} из ${previousCount} сущностей`
    });
  }
  
  return warnings;
}

/**
 * Проверяет подозрительные паттерны в данных
 * @param {Map} currentMap - текущие данные
 * @param {string} category - категория
 * @returns {Array} Массив предупреждений
 */
function detectSuspiciousPatterns(currentMap, category) {
  const warnings = [];
  
  // Проверка на пустые или минимальные объекты
  let emptyObjects = 0;
  let minimalObjects = 0;
  
  for (const [id, item] of currentMap.entries()) {
    const keys = Object.keys(item || {});
    
    if (keys.length === 0) {
      emptyObjects++;
    } else if (keys.length <= 2) {
      minimalObjects++;
    }
  }
  
  if (emptyObjects > 0) {
    warnings.push({
      type: "EMPTY_OBJECTS",
      category: category,
      severity: "warning",
      count: emptyObjects,
      message: `Обнаружено ${emptyObjects} пустых объектов в ${category}`
    });
  }
  
  if (minimalObjects > currentMap.size * 0.1) {
    warnings.push({
      type: "MINIMAL_OBJECTS",
      category: category,
      severity: "warning",
      count: minimalObjects,
      percentage: ((minimalObjects / currentMap.size) * 100).toFixed(1),
      message: `Много минимальных объектов в ${category}: ${minimalObjects} (${((minimalObjects / currentMap.size) * 100).toFixed(1)}%)`
    });
  }
  
  return warnings;
}

/**
 * Проверяет риски нарушения связей между сущностями
 * @param {object} currentData - текущие данные всех категорий
 * @returns {Array} Массив предупреждений
 */
function checkRelationshipRisks(currentData) {
  const warnings = [];
  
  // Проверка моделей без серий
  if (currentData.models && currentData.series) {
    const seriesIds = new Set(currentData.series.keys());
    let orphanedModels = 0;
    
    for (const [modelId, model] of currentData.models.entries()) {
      const seriesId = model.seriesId || model.series;
      if (seriesId && !seriesIds.has(seriesId)) {
        orphanedModels++;
      }
    }
    
    if (orphanedModels > 0) {
      warnings.push({
        type: "ORPHANED_MODELS",
        severity: "error",
        count: orphanedModels,
        message: `Обнаружено ${orphanedModels} моделей без соответствующих серий`
      });
    }
  }
  
  // Проверка длин без моделей
  if (currentData.lengths && currentData.models) {
    const modelIds = new Set(currentData.models.keys());
    let orphanedLengths = 0;
    
    for (const [lengthId, length] of currentData.lengths.entries()) {
      const modelId = length.modelId || length.model;
      if (modelId && !modelIds.has(modelId)) {
        orphanedLengths++;
      }
    }
    
    if (orphanedLengths > 0) {
      warnings.push({
        type: "ORPHANED_LENGTHS",
        severity: "error",
        count: orphanedLengths,
        message: `Обнаружено ${orphanedLengths} длин без соответствующих моделей`
      });
    }
  }
  
  return warnings;
}

/**
 * Анализирует стабильность идентификаторов
 * @param {Map} currentMap - текущие данные
 * @param {object} previousData - предыдущие данные
 * @param {string} category - категория
 * @returns {Array} Массив предупреждений
 */
function analyzeIdStability(currentMap, previousData, category) {
  const warnings = [];
  
  if (!previousData || !previousData[category]) {
    return warnings;
  }
  
  const previousIds = new Set(Object.keys(previousData[category]));
  const currentIds = new Set(currentMap.keys());
  
  // Проверка на массовое изменение ID
  let changedIds = 0;
  let newIds = 0;
  
  for (const currentId of currentIds) {
    if (!previousIds.has(currentId)) {
      newIds++;
    }
  }
  
  for (const previousId of previousIds) {
    if (!currentIds.has(previousId)) {
      changedIds++;
    }
  }
  
  const totalPrevious = previousIds.size;
  const idChangeRate = totalPrevious > 0 ? ((changedIds + newIds) / totalPrevious) * 100 : 0;
  
  if (idChangeRate > 20) {
    warnings.push({
      type: "HIGH_ID_CHURN",
      category: category,
      severity: "warning",
      newIds: newIds,
      removedIds: changedIds,
      changeRate: idChangeRate.toFixed(1),
      message: `Высокая текучесть ID в ${category}: ${newIds} новых, ${changedIds} удалённых (${idChangeRate.toFixed(1)}% изменений)`
    });
  }
  
  return warnings;
}

/**
 * Запускает эвристический анализ данных
 * @param {object} currentData - текущие данные { series: Map, models: Map, lengths: Map }
 * @param {object} previousData - предыдущие данные { series: {}, models: {}, lengths: {} }
 * @returns {object} Результат эвристического анализа
 */
export async function runHeuristics(currentData, previousData = null) {
  logger.logInfo('Запуск эвристического анализа...');
  
  const result = {
    timestamp: new Date().toISOString(),
    warnings: [],
    errors: [],
    stats: {
      totalWarnings: 0,
      totalErrors: 0,
      categoriesAnalyzed: []
    }
  };
  
  try {
    const categories = ['series', 'models', 'lengths'];
    
    // Анализ каждой категории
    for (const category of categories) {
      if (!currentData[category]) {
        continue;
      }
      
      result.stats.categoriesAnalyzed.push(category);
      
      // 1. Анализ изменений в количестве
      const countWarnings = analyzeEntityCountChanges(
        currentData[category],
        previousData,
        category
      );
      result.warnings.push(...countWarnings.filter(w => w.severity === 'warning'));
      result.errors.push(...countWarnings.filter(w => w.severity === 'error'));
      
      // 2. Обнаружение подозрительных паттернов
      const patternWarnings = detectSuspiciousPatterns(
        currentData[category],
        category
      );
      result.warnings.push(...patternWarnings);
      
      // 3. Анализ стабильности ID
      const idWarnings = analyzeIdStability(
        currentData[category],
        previousData,
        category
      );
      result.warnings.push(...idWarnings);
    }
    
    // 4. Проверка рисков нарушения связей
    const relationshipWarnings = checkRelationshipRisks(currentData);
    result.warnings.push(...relationshipWarnings.filter(w => w.severity === 'warning'));
    result.errors.push(...relationshipWarnings.filter(w => w.severity === 'error'));
    
    // Подсчёт итоговой статистики
    result.stats.totalWarnings = result.warnings.length;
    result.stats.totalErrors = result.errors.length;
    
    logger.logInfo(`Эвристический анализ завершён: ${result.stats.totalWarnings} предупреждений, ${result.stats.totalErrors} ошибок`);
    
    return result;
    
  } catch (error) {
    logger.logError(`Ошибка эвристического анализа: ${error.message}`);
    result.errors.push({
      type: "HEURISTICS_ERROR",
      severity: "critical",
      message: error.message
    });
    throw error;
  }
}

/**
 * Экспорт для использования в других модулях
 */
export default runHeuristics;


