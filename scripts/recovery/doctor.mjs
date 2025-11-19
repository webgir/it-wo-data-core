import fs from "fs";
import path from "path";
// Утилиты IWDC v0.6
import * as paths from "../../utils/paths.mjs";
import * as logger from "../../utils/logger.mjs";
import { loadRecoveryState } from "./state.mjs";
import { testData } from "../test-data.mjs";
import { run as bcValidator } from "../audit/bc-validator.mjs";
import { loadPreviousSnapshot } from "../../utils/loadPreviousSnapshot.mjs";
import { buildRepairPlan, applyRepairPlan } from "./repair-strategies.mjs";
import { writeJsonFile, loadJsonMap } from "../../utils/file.mjs";

/**
 * Сравнивает текущие данные с предыдущей версией и собирает статистику
 */
async function compareWithPreviousVersion(previousVersion) {
  try {
    const previousData = loadPreviousSnapshot(previousVersion);
    if (!previousData) {
      return {
        status: "error",
        message: `Не удалось загрузить данные версии ${previousVersion}`
      };
    }
    
    // Загружаем текущие данные
    const currentSeries = loadJsonMap(paths.getDataJsonPath("series"));
    const currentModels = loadJsonMap(paths.getDataJsonPath("models"));
    const currentLengths = loadJsonMap(paths.getDataJsonPath("lengths"));
    
    // Подсчитываем изменения
    const diffStats = {
      series: {
        added: 0,
        removed: 0,
        changed: 0
      },
      models: {
        added: 0,
        removed: 0,
        changed: 0
      },
      lengths: {
        added: 0,
        removed: 0,
        changed: 0
      }
    };
    
    // Сравниваем каждую категорию
    function compareCategory(currentMap, previousData) {
      const previousMap = new Map(Object.entries(previousData || {}));
      let added = 0;
      let removed = 0;
      
      // Удалённые
      for (const [id] of previousMap.entries()) {
        if (!currentMap.has(id)) {
          removed++;
        }
      }
      
      // Добавленные
      for (const [id] of currentMap.entries()) {
        if (!previousMap.has(id)) {
          added++;
        }
      }
      
      return { added, removed, changed: 0 }; // changed можно добавить при необходимости
    }
    
    diffStats.series = compareCategory(currentSeries, previousData.series);
    diffStats.models = compareCategory(currentModels, previousData.models);
    diffStats.lengths = compareCategory(currentLengths, previousData.lengths);
    
    return {
      status: "ok",
      diffStats: diffStats
    };
  } catch (error) {
    return {
      status: "error",
      message: error.message
    };
  }
}

/**
 * Запускает диагностику данных IWDC
 * @param {object} options - параметры
 * @param {boolean} options.apply - применять ли автоматический ремонт
 * @param {boolean} options.autoRepair - использовать ли авторемонт при обнаружении проблем
 * @returns {object} Результат диагностики
 */
export async function runDoctor({ apply = false, autoRepair = false }) {
  logger.logHeader('IWDC Doctor - Диагностика данных', '🩺');
  
  const report = {
    timestamp: new Date().toISOString(),
    status: "unknown",
    lastSuccessfulVersion: null,
    diagnostics: {
      validation: null,
      bcAudit: null,
      diffComparison: null
    },
    analysis: {
      canAutoRepair: false,
      problems: [],
      recommendations: []
    },
    repairPlan: null,
    repairApplied: false
  };
  
  try {
    // 1. Получение последней успешной версии
    logger.logStep('ШАГ 1: ПОЛУЧЕНИЕ ПОСЛЕДНЕЙ УСПЕШНОЙ ВЕРСИИ', '📋');
    
    const state = loadRecoveryState();
    const lastSuccessfulVersion = state.lastSuccessfulVersion;
    
    if (!lastSuccessfulVersion) {
      logger.logWarning('Последняя успешная версия не найдена в recovery state');
      report.status = "no-successful-version";
      report.analysis.recommendations.push("Установите lastSuccessfulVersion в recovery state");
      
      // Сохраняем отчёт
      saveDoctorReport(report);
      return report;
    }
    
    report.lastSuccessfulVersion = lastSuccessfulVersion;
    logger.logInfo(`Последняя успешная версия: ${lastSuccessfulVersion}`);
    
    // 2. Диагностика данных
    logger.logStep('ШАГ 2: ДИАГНОСТИКА ДАННЫХ', '🔍');
    
    // 2.1. Валидация
    logger.logInfo('Запуск валидации данных...');
    const validationResult = await testData();
    report.diagnostics.validation = {
      status: validationResult.totalErrors > 0 ? "error" : "ok",
      totalErrors: validationResult.totalErrors,
      details: validationResult
    };
    
    if (validationResult.totalErrors > 0) {
      logger.logError(`Валидация завершена с ошибками: ${validationResult.totalErrors}`);
      report.analysis.problems.push({
        type: "validation",
        severity: "error",
        count: validationResult.totalErrors
      });
    } else {
      logger.logSuccess('Валидация пройдена успешно');
    }
    
    // 2.2. BC-аудит
    logger.logInfo('Запуск BC-аудита...');
    const bcAuditResult = await bcValidator();
    report.diagnostics.bcAudit = {
      status: bcAuditResult.status,
      errors: bcAuditResult.errors.length,
      warnings: bcAuditResult.warnings.length,
      stats: bcAuditResult.stats,
      details: bcAuditResult
    };
    
    if (bcAuditResult.status === "error") {
      logger.logError(`BC-аудит обнаружил ошибки: ${bcAuditResult.errors.length}`);
      report.analysis.problems.push({
        type: "bc-audit",
        severity: "error",
        count: bcAuditResult.errors.length,
        errors: bcAuditResult.errors
      });
    } else {
      logger.logSuccess('BC-аудит пройден успешно');
    }
    
    // 2.3. Сравнение с предыдущей версией
    logger.logInfo('Сравнение с предыдущей версией...');
    const diffComparison = await compareWithPreviousVersion(lastSuccessfulVersion);
    report.diagnostics.diffComparison = diffComparison;
    
    if (diffComparison.status === "ok") {
      const stats = diffComparison.diffStats;
      const totalAdded = stats.series.added + stats.models.added + stats.lengths.added;
      const totalRemoved = stats.series.removed + stats.models.removed + stats.lengths.removed;
      const totalChanged = stats.series.changed + stats.models.changed + stats.lengths.changed;
      
      logger.logInfo(`Изменения: +${totalAdded} -${totalRemoved} ~${totalChanged}`);
      
      if (totalRemoved > 0) {
        report.analysis.problems.push({
          type: "removed-entities",
          severity: "warning",
          count: totalRemoved
        });
      }
    } else {
      logger.logWarning(`Ошибка сравнения: ${diffComparison.message}`);
    }
    
    // 3. Анализ проблем
    logger.logStep('ШАГ 3: АНАЛИЗ ПРОБЛЕМ', '📊');
    
    const hasValidationErrors = report.diagnostics.validation?.status === "error";
    const hasBcErrors = report.diagnostics.bcAudit?.status === "error";
    const hasPreviousVersion = !!lastSuccessfulVersion;
    
    // Определяем возможность авторемонта
    report.analysis.canAutoRepair = (
      (hasValidationErrors || hasBcErrors) &&
      hasPreviousVersion
    );
    
    if (report.analysis.canAutoRepair) {
      logger.logInfo('Обнаружены проблемы, которые можно исправить автоматически');
      report.analysis.recommendations.push("Доступен автоматический ремонт через repair plan");
    } else {
      if (!hasPreviousVersion) {
        logger.logWarning('Невозможно выполнить авторемонт: отсутствует предыдущая версия');
        report.analysis.recommendations.push("Установите lastSuccessfulVersion для возможности авторемонта");
      } else if (!hasValidationErrors && !hasBcErrors) {
        logger.logSuccess('Проблем не обнаружено, авторемонт не требуется');
      }
    }
    
    // 4. Построение плана ремонта (если возможно)
    if (report.analysis.canAutoRepair && (autoRepair || apply)) {
      logger.logStep('ШАГ 4: ПОСТРОЕНИЕ ПЛАНА РЕМОНТА', '🔧');
      
      try {
        const repairPlan = buildRepairPlan({
          previousVersion: lastSuccessfulVersion
        });
        
        report.repairPlan = {
          file: repairPlan.file,
          summary: repairPlan.summary,
          operationsCount: repairPlan.operations.length
        };
        
        logger.logSuccess(`План ремонта создан: ${repairPlan.operations.length} операций`);
        
        // 5. Применение плана (если apply=true)
        if (apply) {
          logger.logStep('ШАГ 5: ПРИМЕНЕНИЕ ПЛАНА РЕМОНТА', '⚙️');
          
          const repairResult = applyRepairPlan(repairPlan, { dryRun: false });
          report.repairApplied = repairResult.success;
          
          if (repairResult.success) {
            logger.logSuccess('План ремонта применён успешно');
            report.status = "repaired";
          } else {
            logger.logError('Ошибка применения плана ремонта');
            report.status = "repair-failed";
          }
        } else if (autoRepair) {
          logger.logInfo('План создан, но не применён (используйте --apply для применения)');
          report.status = "repair-plan-ready";
        }
      } catch (error) {
        logger.logError(`Ошибка построения/применения плана: ${error.message}`);
        report.status = "repair-plan-failed";
        report.analysis.recommendations.push(`Ошибка ремонта: ${error.message}`);
      }
    } else {
      if (hasValidationErrors || hasBcErrors) {
        report.status = "problems-detected";
      } else {
        report.status = "ok";
      }
    }
    
    // Сохраняем отчёт
    saveDoctorReport(report);
    
    // Итоговый вывод
    logger.logSeparator();
    logger.logSection('ИТОГОВЫЙ СТАТУС', '📊');
    logger.logInfo(`Статус: ${report.status}`);
    logger.logInfo(`Проблем обнаружено: ${report.analysis.problems.length}`);
    logger.logInfo(`Авторемонт доступен: ${report.analysis.canAutoRepair ? 'да' : 'нет'}`);
    
    if (report.repairPlan) {
      logger.logInfo(`План ремонта: ${report.repairPlan.operationsCount} операций`);
    }
    
    if (report.analysis.recommendations.length > 0) {
      logger.logSection('РЕКОМЕНДАЦИИ', '💡');
      for (const rec of report.analysis.recommendations) {
        logger.logInfo(`  • ${rec}`);
      }
    }
    
    logger.logSeparator();
    console.log('');
    
    return report;
    
  } catch (error) {
    logger.logError(`Критическая ошибка диагностики: ${error.message}`);
    report.status = "error";
    report.error = error.message;
    saveDoctorReport(report);
    throw error;
  }
}

/**
 * Сохраняет отчёт диагностики
 */
function saveDoctorReport(report) {
  try {
    const reportsDir = path.join(process.cwd(), "data", "recovery", "doctor-reports");
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    
    const timestamp = report.timestamp.replace(/[:.]/g, '-').slice(0, -5);
    const reportFile = path.join(reportsDir, `doctor-${timestamp}.json`);
    
    writeJsonFile(reportFile, report);
    logger.logInfo(`Отчёт сохранён: ${reportFile}`);
  } catch (error) {
    logger.logWarning(`Не удалось сохранить отчёт: ${error.message}`);
  }
}

