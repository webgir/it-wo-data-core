import fs from "fs";
import path from "path";
// Утилиты IWDC v0.6
import * as logger from "../../utils/logger.mjs";

/**
 * Модуль отчётов и логов Live Delta Layer IWDC v0.9
 * 
 * Выводит отчёты в консоль и записывает логи в файлы
 */

/**
 * Выводит отчёт о валидации и diff в консоль
 * @param {object} validation - результат валидации
 * @param {object} diff - результат diff
 */
export function printLiveReport(validation, diff) {
  const timestamp = new Date().toISOString();
  const fileName = path.basename(validation.file);
  
  logger.logSeparator(60);
  logger.logSection(`LIVE DELTA: ${fileName}`, '⚡');
  logger.logInfo(`Время: ${timestamp}`);
  
  // Валидация
  console.log('\n📋 Валидация:');
  console.log(`   Статус: ${validation.status.toUpperCase()}`);
  
  if (validation.errors.length > 0) {
    console.log(`   Ошибок: ${validation.errors.length}`);
    validation.errors.slice(0, 5).forEach((error, index) => {
      console.log(`   [${index + 1}] ${error.type}: ${error.message}`);
      if (error.field) {
        console.log(`       Поле: ${error.field}`);
      }
    });
    if (validation.errors.length > 5) {
      console.log(`   ... и ещё ${validation.errors.length - 5} ошибок`);
    }
  }
  
  if (validation.warnings.length > 0) {
    console.log(`   Предупреждений: ${validation.warnings.length}`);
    validation.warnings.slice(0, 3).forEach((warning, index) => {
      console.log(`   [${index + 1}] ${warning.type}: ${warning.message}`);
    });
    if (validation.warnings.length > 3) {
      console.log(`   ... и ещё ${validation.warnings.length - 3} предупреждений`);
    }
  }
  
  if (validation.errors.length === 0 && validation.warnings.length === 0) {
    console.log(`   ✅ Файл валиден`);
  }
  
  // Diff
  if (diff && diff.status !== "error") {
    console.log('\n🔍 Diff:');
    console.log(`   Статус сущности: ${diff.entityStatus}`);
    
    if (diff.previousVersion) {
      console.log(`   Версия для сравнения: ${diff.previousVersion}`);
    }
    
    if (diff.entityStatus === "new") {
      console.log(`   ✨ Новая сущность`);
    } else if (diff.entityStatus === "modified") {
      console.log(`   Изменено полей:`);
      console.log(`     Добавлено: ${diff.changes.added.length}`);
      console.log(`     Удалено: ${diff.changes.removed.length}`);
      console.log(`     Изменено: ${diff.changes.changed.length}`);
      
      if (diff.changes.added.length > 0) {
        console.log(`\n   Добавленные поля:`);
        diff.changes.added.slice(0, 5).forEach(change => {
          console.log(`     + ${change.key}`);
        });
      }
      
      if (diff.changes.removed.length > 0) {
        console.log(`\n   Удалённые поля:`);
        diff.changes.removed.slice(0, 5).forEach(change => {
          console.log(`     - ${change.key}`);
        });
      }
      
      if (diff.changes.changed.length > 0) {
        console.log(`\n   Изменённые поля:`);
        diff.changes.changed.slice(0, 5).forEach(change => {
          console.log(`     ~ ${change.key}`);
        });
      }
    } else if (diff.entityStatus === "unchanged") {
      console.log(`   ✅ Изменений не обнаружено`);
    }
    
    if (diff.warning) {
      console.log(`\n   ⚠️  ${diff.warning}`);
    }
  } else if (diff && diff.status === "error") {
    console.log('\n🔍 Diff:');
    console.log(`   ❌ Ошибка: ${diff.error}`);
  }
  
  logger.logSeparator(60);
  console.log('');
}

/**
 * Записывает лог в файл
 * @param {object} validation - результат валидации
 * @param {object} diff - результат diff
 */
export function writeLiveLog(validation, diff) {
  try {
    const logsDir = path.join(process.cwd(), "logs", "live-delta");
    
    // Создаём директорию, если её нет
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    // Формируем имя файла с датой
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const logFile = path.join(logsDir, `${today}.log`);
    
    // Формируем запись лога
    const timestamp = new Date().toISOString();
    const logEntry = [
      `[${timestamp}] ${validation.file}`,
      `  Validation: ${validation.status.toUpperCase()}`,
      `  Errors: ${validation.errors.length}`,
      `  Warnings: ${validation.warnings.length}`
    ];
    
    if (diff) {
      logEntry.push(`  Diff Status: ${diff.status}`);
      logEntry.push(`  Entity Status: ${diff.entityStatus || 'unknown'}`);
      if (diff.previousVersion) {
        logEntry.push(`  Previous Version: ${diff.previousVersion}`);
      }
      if (diff.changes) {
        logEntry.push(`  Changes: +${diff.changes.added.length} -${diff.changes.removed.length} ~${diff.changes.changed.length}`);
      }
    }
    
    if (validation.errors.length > 0) {
      logEntry.push(`  Validation Errors:`);
      validation.errors.forEach(error => {
        logEntry.push(`    - ${error.type}: ${error.message}`);
        if (error.field) {
          logEntry.push(`      Field: ${error.field}`);
        }
      });
    }
    
    if (validation.warnings.length > 0) {
      logEntry.push(`  Validation Warnings:`);
      validation.warnings.forEach(warning => {
        logEntry.push(`    - ${warning.type}: ${warning.message}`);
      });
    }
    
    if (diff && diff.changes) {
      if (diff.changes.added.length > 0) {
        logEntry.push(`  Added Fields: ${diff.changes.added.map(c => c.key).join(', ')}`);
      }
      if (diff.changes.removed.length > 0) {
        logEntry.push(`  Removed Fields: ${diff.changes.removed.map(c => c.key).join(', ')}`);
      }
      if (diff.changes.changed.length > 0) {
        logEntry.push(`  Changed Fields: ${diff.changes.changed.map(c => c.key).join(', ')}`);
      }
    }
    
    logEntry.push(''); // Пустая строка для разделения записей
    
    // Записываем в файл (append mode)
    fs.appendFileSync(logFile, logEntry.join('\n') + '\n', 'utf-8');
    
  } catch (error) {
    logger.logWarning(`Не удалось записать лог: ${error.message}`);
  }
}

/**
 * Экспорт для использования в других модулях
 */
export default { printLiveReport, writeLiveLog };


