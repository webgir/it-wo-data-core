// Утилиты IWDC v0.6
import * as logger from "../../utils/logger.mjs";

/**
 * Модуль анализа консистентности ID и slug IWDC v0.8
 * 
 * Проверяет:
 * - Уникальность ID и slug внутри категорий
 * - Консистентность между ID и slug
 * - Стабильность идентификаторов между версиями
 * - Риски конфликтов идентификаторов
 */

/**
 * Получает ID объекта в зависимости от категории
 * @param {any} obj - объект
 * @param {string} category - категория (series, models, lengths)
 * @returns {string|null} ID объекта
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
 * Получает slug объекта
 * @param {any} obj - объект
 * @returns {string|null} slug объекта
 */
function getSlug(obj) {
  return obj.slug || null;
}

/**
 * Проверяет уникальность ID внутри категории
 * @param {Map} dataMap - карта данных (Map<id, data>)
 * @param {string} category - категория
 * @returns {Array} Массив ошибок дубликатов
 */
function checkIdUniqueness(dataMap, category) {
  const errors = [];
  const seenIds = new Map();
  
  for (const [id, item] of dataMap.entries()) {
    const actualId = getId(item, category);
    
    if (!actualId) {
      errors.push({
        type: "MISSING_ID",
        category: category,
        severity: "error",
        item: id,
        message: `Объект в ${category} не имеет ID`
      });
      continue;
    }
    
    if (seenIds.has(actualId)) {
      errors.push({
        type: "DUPLICATE_ID",
        category: category,
        severity: "error",
        id: actualId,
        firstOccurrence: seenIds.get(actualId),
        duplicateOccurrence: id,
        message: `Дубликат ID "${actualId}" в ${category}`
      });
    } else {
      seenIds.set(actualId, id);
    }
  }
  
  return errors;
}

/**
 * Проверяет уникальность slug внутри категории
 * @param {Map} dataMap - карта данных
 * @param {string} category - категория
 * @returns {Array} Массив предупреждений о дубликатах slug
 */
function checkSlugUniqueness(dataMap, category) {
  const warnings = [];
  const seenSlugs = new Map();
  
  for (const [id, item] of dataMap.entries()) {
    const slug = getSlug(item);
    
    if (!slug) {
      // Отсутствие slug не критично, пропускаем
      continue;
    }
    
    if (seenSlugs.has(slug)) {
      warnings.push({
        type: "DUPLICATE_SLUG",
        category: category,
        severity: "warning",
        slug: slug,
        firstOccurrence: seenSlugs.get(slug),
        duplicateOccurrence: id,
        message: `Дубликат slug "${slug}" в ${category}`
      });
    } else {
      seenSlugs.set(slug, id);
    }
  }
  
  return warnings;
}

/**
 * Проверяет консистентность между ID и slug
 * @param {Map} dataMap - карта данных
 * @param {string} category - категория
 * @returns {Array} Массив предупреждений о несоответствиях
 */
function checkIdSlugConsistency(dataMap, category) {
  const warnings = [];
  
  for (const [id, item] of dataMap.entries()) {
    const actualId = getId(item, category);
    const slug = getSlug(item);
    
    // Если есть и ID и slug, проверяем их соответствие
    if (actualId && slug) {
      // В некоторых случаях slug может быть частью ID или наоборот
      // Это нормально, но если они полностью не совпадают и не связаны - предупреждение
      if (actualId !== slug && !actualId.includes(slug) && !slug.includes(actualId)) {
        // Проверяем, не является ли это нормальным паттерном
        // Например, для models slug может быть "model-slug", а id - "model-slug-v1"
        const isNormalPattern = slug.length > 0 && actualId.length > slug.length;
        
        if (!isNormalPattern) {
          warnings.push({
            type: "ID_SLUG_MISMATCH",
            category: category,
            severity: "warning",
            id: actualId,
            slug: slug,
            item: id,
            message: `Несоответствие ID и slug в ${category}: ID="${actualId}", slug="${slug}"`
          });
        }
      }
    }
  }
  
  return warnings;
}

/**
 * Проверяет стабильность идентификаторов между версиями
 * @param {Map} currentMap - текущие данные
 * @param {object} previousData - предыдущие данные
 * @param {string} category - категория
 * @returns {Array} Массив предупреждений о нестабильности
 */
function checkIdStability(currentMap, previousData, category) {
  const warnings = [];
  
  if (!previousData || !previousData[category]) {
    return warnings;
  }
  
  const previousMap = new Map(Object.entries(previousData[category]));
  
  // Проверяем изменения ID для объектов с одинаковыми slug
  const slugToIdMap = new Map(); // slug -> { currentId, previousId }
  
  // Собираем slug -> ID для текущих данных
  for (const [id, item] of currentMap.entries()) {
    const slug = getSlug(item);
    if (slug) {
      if (!slugToIdMap.has(slug)) {
        slugToIdMap.set(slug, { currentId: id, previousId: null });
      }
    }
  }
  
  // Собираем slug -> ID для предыдущих данных
  for (const [id, item] of previousMap.entries()) {
    const slug = getSlug(item);
    if (slug && slugToIdMap.has(slug)) {
      const entry = slugToIdMap.get(slug);
      entry.previousId = id;
    }
  }
  
  // Проверяем изменения ID
  for (const [slug, ids] of slugToIdMap.entries()) {
    if (ids.previousId && ids.currentId && ids.previousId !== ids.currentId) {
      warnings.push({
        type: "ID_CHANGED",
        category: category,
        severity: "error",
        slug: slug,
        previousId: ids.previousId,
        currentId: ids.currentId,
        message: `ID изменился для slug "${slug}" в ${category}: ${ids.previousId} → ${ids.currentId}`
      });
    }
  }
  
  return warnings;
}

/**
 * Проверяет риски конфликтов идентификаторов между категориями
 * @param {object} currentData - текущие данные всех категорий
 * @returns {Array} Массив предупреждений о конфликтах
 */
function checkCrossCategoryConflicts(currentData) {
  const warnings = [];
  
  // Собираем все ID и slug из всех категорий
  const allIds = new Map(); // id -> { category, item }
  const allSlugs = new Map(); // slug -> [{ category, item }]
  
  const categories = ['series', 'models', 'lengths'];
  
  for (const category of categories) {
    if (!currentData[category]) {
      continue;
    }
    
    for (const [id, item] of currentData[category].entries()) {
      const actualId = getId(item, category);
      const slug = getSlug(item);
      
      if (actualId) {
        if (allIds.has(actualId)) {
          const existing = allIds.get(actualId);
          if (existing.category !== category) {
            warnings.push({
              type: "CROSS_CATEGORY_ID_CONFLICT",
              severity: "warning",
              id: actualId,
              category1: existing.category,
              category2: category,
              message: `ID "${actualId}" используется в разных категориях: ${existing.category} и ${category}`
            });
          }
        } else {
          allIds.set(actualId, { category, item: id });
        }
      }
      
      if (slug) {
        if (!allSlugs.has(slug)) {
          allSlugs.set(slug, []);
        }
        allSlugs.get(slug).push({ category, item: id });
      }
    }
  }
  
  // Проверяем slug, используемые в разных категориях
  for (const [slug, occurrences] of allSlugs.entries()) {
    if (occurrences.length > 1) {
      const categories = [...new Set(occurrences.map(o => o.category))];
      if (categories.length > 1) {
        warnings.push({
          type: "CROSS_CATEGORY_SLUG_CONFLICT",
          severity: "warning",
          slug: slug,
          categories: categories,
          message: `Slug "${slug}" используется в разных категориях: ${categories.join(', ')}`
        });
      }
    }
  }
  
  return warnings;
}

/**
 * Запускает проверку консистентности ID и slug
 * @param {object} currentData - текущие данные { series: Map, models: Map, lengths: Map }
 * @param {object} previousData - предыдущие данные { series: {}, models: {}, lengths: {} }
 * @returns {object} Результат проверки консистентности
 */
export async function checkIdConsistency(currentData, previousData = null) {
  logger.logInfo('Проверка консистентности ID и slug...');
  
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
    
    // Проверка каждой категории
    for (const category of categories) {
      if (!currentData[category]) {
        continue;
      }
      
      result.stats.categoriesAnalyzed.push(category);
      
      // 1. Проверка уникальности ID
      const idErrors = checkIdUniqueness(currentData[category], category);
      result.errors.push(...idErrors);
      
      // 2. Проверка уникальности slug
      const slugWarnings = checkSlugUniqueness(currentData[category], category);
      result.warnings.push(...slugWarnings);
      
      // 3. Проверка консистентности ID и slug
      const consistencyWarnings = checkIdSlugConsistency(currentData[category], category);
      result.warnings.push(...consistencyWarnings);
      
      // 4. Проверка стабильности ID (если есть предыдущая версия)
      if (previousData) {
        const stabilityWarnings = checkIdStability(
          currentData[category],
          previousData,
          category
        );
        result.warnings.push(...stabilityWarnings.filter(w => w.severity === 'warning'));
        result.errors.push(...stabilityWarnings.filter(w => w.severity === 'error'));
      }
    }
    
    // 5. Проверка конфликтов между категориями
    const conflictWarnings = checkCrossCategoryConflicts(currentData);
    result.warnings.push(...conflictWarnings);
    
    // Подсчёт итоговой статистики
    result.stats.totalWarnings = result.warnings.length;
    result.stats.totalErrors = result.errors.length;
    
    logger.logInfo(`Проверка консистентности завершена: ${result.stats.totalWarnings} предупреждений, ${result.stats.totalErrors} ошибок`);
    
    return result;
    
  } catch (error) {
    logger.logError(`Ошибка проверки консистентности: ${error.message}`);
    result.errors.push({
      type: "CONSISTENCY_CHECK_ERROR",
      severity: "critical",
      message: error.message
    });
    throw error;
  }
}

/**
 * Экспорт для использования в других модулях
 */
export default checkIdConsistency;


