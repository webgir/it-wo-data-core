import path from "path";
// Утилиты IWDC v0.6
import * as paths from "../../utils/paths.mjs";
import * as logger from "../../utils/logger.mjs";
import { loadRecoveryState } from "../recovery/state.mjs";
import { loadPreviousSnapshot } from "../../utils/loadPreviousSnapshot.mjs";
import { loadJsonMap } from "../../utils/file.mjs";
import { savePredictiveAnalysis } from "./predictive-report.mjs";

/**
 * Оркестратор предиктивного слоя IWDC v0.8
 * 
 * Predictive Integrity Layer анализирует данные ДО основной сборки,
 * предсказывая потенциальные проблемы и нарушения целостности.
 * 
 * Процесс:
 * 1. Загрузка текущих данных и последней успешной версии
 * 2. Анализ через эвристики
 * 3. Проверка консистентности ID/slug
 * 4. Мягкий diff с последней успешной версией
 * 5. Генерация предиктивного отчёта
 */

/**
 * Загружает текущие данные для анализа
 */
function loadCurrentData() {
  const currentSeries = loadJsonMap(paths.getDataJsonPath("series"));
  const currentModels = loadJsonMap(paths.getDataJsonPath("models"));
  const currentLengths = loadJsonMap(paths.getDataJsonPath("lengths"));
  
  return {
    series: currentSeries,
    models: currentModels,
    lengths: currentLengths
  };
}

/**
 * Основная функция предиктивного анализа
 * @param {object} options - параметры анализа
 * @param {string} options.lastSuccessfulVersion - версия для сравнения (опционально)
 * @param {boolean} options.strict - строгий режим (прерывать при критических проблемах)
 * @returns {object} Результат предиктивного анализа
 */
export async function runPredictiveAnalysis({ lastSuccessfulVersion = null, strict = false } = {}) {
  logger.logStep('ПРЕДИКТИВНЫЙ АНАЛИЗ ЦЕЛОСТНОСТИ', '🔮');
  
  const result = {
    timestamp: new Date().toISOString(),
    status: "ok",
    lastSuccessfulVersion: null,
    warnings: [],
    errors: [],
    heuristics: null,
    idConsistency: null,
    predictiveDiff: null,
    summary: {
      totalWarnings: 0,
      totalErrors: 0,
      criticalIssues: 0
    }
  };
  
  try {
    // 1. Загрузка recovery state для получения последней успешной версии
    const recoveryState = loadRecoveryState();
    const targetVersion = lastSuccessfulVersion || recoveryState.lastSuccessfulVersion;
    
    if (!targetVersion) {
      logger.logWarning('Последняя успешная версия не найдена, предиктивный анализ ограничен');
      result.warnings.push({
        type: "NO_REFERENCE_VERSION",
        message: "Невозможно сравнить с предыдущей версией"
      });
      result.status = "limited";
    } else {
      result.lastSuccessfulVersion = targetVersion;
      logger.logInfo(`Используется версия для сравнения: ${targetVersion}`);
    }
    
    // 2. Загрузка текущих данных
    logger.logInfo('Загрузка текущих данных...');
    const currentData = loadCurrentData();
    
    const currentStats = {
      series: currentData.series.size,
      models: currentData.models.size,
      lengths: currentData.lengths.size
    };
    
    logger.logInfo(`Текущие данные: series=${currentStats.series}, models=${currentStats.models}, lengths=${currentStats.lengths}`);
    
    // 3. Загрузка данных последней успешной версии (если доступна)
    let previousData = null;
    if (targetVersion) {
      logger.logInfo(`Загрузка данных версии ${targetVersion}...`);
      previousData = loadPreviousSnapshot(targetVersion);
      
      if (!previousData) {
        logger.logWarning(`Не удалось загрузить данные версии ${targetVersion}`);
        result.warnings.push({
          type: "VERSION_LOAD_FAILED",
          message: `Версия ${targetVersion} не найдена или повреждена`,
          version: targetVersion
        });
      } else {
        const previousStats = {
          series: Object.keys(previousData.series || {}).length,
          models: Object.keys(previousData.models || {}).length,
          lengths: Object.keys(previousData.lengths || {}).length
        };
        logger.logInfo(`Данные версии: series=${previousStats.series}, models=${previousStats.models}, lengths=${previousStats.lengths}`);
      }
    }
    
    // 4. Запуск модулей анализа (будут реализованы в следующих этапах)
    // Пока создаём заглушки для структуры
    
    // 4.1. Эвристики
    logger.logInfo('Запуск эвристического анализа...');
    const { runHeuristics } = await import("./heuristics.mjs");
    const heuristicsResult = await runHeuristics(currentData, previousData);
    result.heuristics = heuristicsResult;
    
    // Добавляем предупреждения и ошибки из эвристик
    result.warnings.push(...heuristicsResult.warnings);
    result.errors.push(...heuristicsResult.errors);
    
    // 4.2. Проверка консистентности ID/slug
    logger.logInfo('Проверка консистентности ID и slug...');
    const { checkIdConsistency } = await import("./id-consistency.mjs");
    const idConsistencyResult = await checkIdConsistency(currentData, previousData);
    result.idConsistency = idConsistencyResult;
    
    // Добавляем предупреждения и ошибки из проверки консистентности
    result.warnings.push(...idConsistencyResult.warnings);
    result.errors.push(...idConsistencyResult.errors);
    
    // 4.3. Предиктивный diff
    if (previousData) {
      logger.logInfo('Выполнение предиктивного diff...');
      const { runPredictiveDiff } = await import("./predictive-diff.mjs");
      const diffResult = await runPredictiveDiff(currentData, previousData);
      result.predictiveDiff = diffResult;
      
      // Добавляем предупреждения и ошибки из предиктивного diff
      result.warnings.push(...diffResult.warnings);
      result.errors.push(...diffResult.errors);
    }
    
    // 5. Подсчёт итоговой статистики
    result.summary.totalWarnings = result.warnings.length;
    result.summary.totalErrors = result.errors.length;
    result.summary.criticalIssues = result.errors.filter(e => e.severity === "critical").length;
    
    // 6. Определение статуса
    if (result.summary.totalErrors > 0) {
      result.status = "error";
    } else if (result.summary.totalWarnings > 0) {
      result.status = "warning";
    }
    
    // 7. Проверка строгого режима
    if (strict && result.status === "error") {
      logger.logError('Предиктивный анализ обнаружил критические проблемы');
      throw new Error(`Predictive analysis failed: ${result.summary.totalErrors} errors detected`);
    }
    
    logger.logSuccess(`Предиктивный анализ завершён: ${result.status}`);
    logger.logInfo(`Предупреждений: ${result.summary.totalWarnings}, Ошибок: ${result.summary.totalErrors}`);
    
    // 8. Сохранение отчёта и лога
    try {
      const savedFiles = savePredictiveAnalysis(result);
      result.reportPath = savedFiles.reportPath;
      result.logPath = savedFiles.logPath;
      logger.logInfo(`Отчёт сохранён: ${savedFiles.reportPath}`);
      logger.logInfo(`Лог сохранён: ${savedFiles.logPath}`);
    } catch (saveError) {
      logger.logWarning(`Не удалось сохранить отчёт/лог: ${saveError.message}`);
    }
    
    return result;
    
  } catch (error) {
    logger.logError(`Ошибка предиктивного анализа: ${error.message}`);
    result.status = "error";
    result.errors.push({
      type: "ANALYSIS_ERROR",
      message: error.message,
      severity: "critical"
    });
    throw error;
  }
}

/**
 * Экспорт для использования в других модулях
 */
export default runPredictiveAnalysis;

