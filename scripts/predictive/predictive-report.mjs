import fs from "fs";
import path from "path";
// Утилиты IWDC v0.6
import * as logger from "../../utils/logger.mjs";
import { writeJsonFile } from "../../utils/file.mjs";

/**
 * Модуль записи отчётов и логов предиктивного анализа IWDC v0.8
 * 
 * Сохраняет результаты предиктивного анализа в:
 * - data/predictive/reports/ - JSON отчёты
 * - data/predictive/logs/ - текстовые логи
 */

/**
 * Сохраняет отчёт предиктивного анализа в JSON
 * @param {object} analysisResult - результат предиктивного анализа
 * @returns {string} Путь к сохранённому файлу отчёта
 */
export function savePredictiveReport(analysisResult) {
  try {
    const reportsDir = path.join(process.cwd(), "data", "predictive", "reports");
    
    // Создаём директорию, если её нет
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    
    // Формируем имя файла с timestamp
    const timestamp = analysisResult.timestamp.replace(/[:.]/g, '-').slice(0, -5);
    const reportFileName = `predictive-${timestamp}.json`;
    const reportPath = path.join(reportsDir, reportFileName);
    
    // Сохраняем отчёт
    writeJsonFile(reportPath, analysisResult);
    
    logger.logInfo(`Отчёт предиктивного анализа сохранён: ${reportPath}`);
    
    return reportPath;
  } catch (error) {
    logger.logWarning(`Не удалось сохранить отчёт: ${error.message}`);
    throw error;
  }
}

/**
 * Сохраняет текстовый лог предиктивного анализа
 * @param {object} analysisResult - результат предиктивного анализа
 * @returns {string} Путь к сохранённому файлу лога
 */
export function savePredictiveLog(analysisResult) {
  try {
    const logsDir = path.join(process.cwd(), "data", "predictive", "logs");
    
    // Создаём директорию, если её нет
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    // Формируем имя файла с timestamp
    const timestamp = analysisResult.timestamp.replace(/[:.]/g, '-').slice(0, -5);
    const logFileName = `predictive-${timestamp}.log`;
    const logPath = path.join(logsDir, logFileName);
    
    // Формируем содержимое лога
    const logLines = [
      '='.repeat(70),
      'IWDC PREDICTIVE INTEGRITY LAYER - ANALYSIS REPORT',
      '='.repeat(70),
      '',
      `Timestamp: ${analysisResult.timestamp}`,
      `Status: ${analysisResult.status.toUpperCase()}`,
      `Last Successful Version: ${analysisResult.lastSuccessfulVersion || 'N/A'}`,
      '',
      'SUMMARY:',
      `  Total Warnings: ${analysisResult.summary.totalWarnings}`,
      `  Total Errors: ${analysisResult.summary.totalErrors}`,
      `  Critical Issues: ${analysisResult.summary.criticalIssues}`,
      '',
      '='.repeat(70),
      'WARNINGS',
      '='.repeat(70),
      ''
    ];
    
    // Добавляем предупреждения
    if (analysisResult.warnings.length === 0) {
      logLines.push('  No warnings.');
    } else {
      analysisResult.warnings.forEach((warning, index) => {
        logLines.push(`[${index + 1}] ${warning.type}`);
        logLines.push(`    Category: ${warning.category || 'N/A'}`);
        logLines.push(`    Severity: ${warning.severity || 'warning'}`);
        logLines.push(`    Message: ${warning.message}`);
        if (warning.id) {
          logLines.push(`    ID: ${warning.id}`);
        }
        if (warning.slug) {
          logLines.push(`    Slug: ${warning.slug}`);
        }
        logLines.push('');
      });
    }
    
    logLines.push('='.repeat(70));
    logLines.push('ERRORS');
    logLines.push('='.repeat(70));
    logLines.push('');
    
    // Добавляем ошибки
    if (analysisResult.errors.length === 0) {
      logLines.push('  No errors.');
    } else {
      analysisResult.errors.forEach((error, index) => {
        logLines.push(`[${index + 1}] ${error.type}`);
        logLines.push(`    Category: ${error.category || 'N/A'}`);
        logLines.push(`    Severity: ${error.severity || 'error'}`);
        logLines.push(`    Message: ${error.message}`);
        if (error.id) {
          logLines.push(`    ID: ${error.id}`);
        }
        if (error.slug) {
          logLines.push(`    Slug: ${error.slug}`);
        }
        if (error.field) {
          logLines.push(`    Field: ${error.field}`);
        }
        logLines.push('');
      });
    }
    
    // Добавляем детали по модулям
    logLines.push('='.repeat(70));
    logLines.push('MODULE DETAILS');
    logLines.push('='.repeat(70));
    logLines.push('');
    
    if (analysisResult.heuristics) {
      logLines.push('HEURISTICS:');
      logLines.push(`  Warnings: ${analysisResult.heuristics.stats.totalWarnings}`);
      logLines.push(`  Errors: ${analysisResult.heuristics.stats.totalErrors}`);
      logLines.push(`  Categories Analyzed: ${analysisResult.heuristics.stats.categoriesAnalyzed.join(', ')}`);
      logLines.push('');
    }
    
    if (analysisResult.idConsistency) {
      logLines.push('ID CONSISTENCY:');
      logLines.push(`  Warnings: ${analysisResult.idConsistency.stats.totalWarnings}`);
      logLines.push(`  Errors: ${analysisResult.idConsistency.stats.totalErrors}`);
      logLines.push(`  Categories Analyzed: ${analysisResult.idConsistency.stats.categoriesAnalyzed.join(', ')}`);
      logLines.push('');
    }
    
    if (analysisResult.predictiveDiff) {
      logLines.push('PREDICTIVE DIFF:');
      logLines.push(`  Added: ${analysisResult.predictiveDiff.stats.totalAdded}`);
      logLines.push(`  Removed: ${analysisResult.predictiveDiff.stats.totalRemoved}`);
      logLines.push(`  Changed: ${analysisResult.predictiveDiff.stats.totalChanged}`);
      logLines.push(`  Suspicious Changes: ${analysisResult.predictiveDiff.stats.totalSuspicious}`);
      logLines.push('');
    }
    
    logLines.push('='.repeat(70));
    logLines.push(`Report generated at: ${new Date().toISOString()}`);
    logLines.push('='.repeat(70));
    
    // Записываем лог
    const logContent = logLines.join('\n');
    fs.writeFileSync(logPath, logContent, 'utf-8');
    
    logger.logInfo(`Лог предиктивного анализа сохранён: ${logPath}`);
    
    return logPath;
  } catch (error) {
    logger.logWarning(`Не удалось сохранить лог: ${error.message}`);
    throw error;
  }
}

/**
 * Сохраняет отчёт и лог предиктивного анализа
 * @param {object} analysisResult - результат предиктивного анализа
 * @returns {object} Пути к сохранённым файлам { reportPath, logPath }
 */
export function savePredictiveAnalysis(analysisResult) {
  const reportPath = savePredictiveReport(analysisResult);
  const logPath = savePredictiveLog(analysisResult);
  
  return {
    reportPath,
    logPath
  };
}

/**
 * Экспорт для использования в других модулях
 */
export default savePredictiveAnalysis;


