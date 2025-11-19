import path from "path";
// Утилиты IWDC v0.6
import * as logger from "../../utils/logger.mjs";
import { loadRecoveryState } from "../../scripts/recovery/state.mjs";
import { restoreFromSnapshot, rollbackToVersion } from "../../scripts/recovery/recovery-core.mjs";
import { runDoctor } from "../../scripts/recovery/doctor.mjs";

/**
 * CLI для управления Recovery системой IWDC
 * 
 * Подкоманды:
 *   status          - показать текущее состояние recovery
 *   restore <version> - восстановить data/json из снимка версии
 *   rollback [<version>] - откатить data/json к версии (или последней успешной)
 * 
 * Флаги:
 *   --dry-run      - пробный запуск без применения изменений
 */

/**
 * Выводит статус recovery системы
 */
function showStatus() {
  logger.logHeader('Recovery Status', '📊');
  
  try {
    const state = loadRecoveryState();
    
    console.log('\n📋 Последняя успешная версия:');
    if (state.lastSuccessfulVersion) {
      console.log(`   ${state.lastSuccessfulVersion}`);
    } else {
      console.log('   (не установлена)');
    }
    
    console.log('\n🔨 Последняя сборка:');
    if (state.lastBuild) {
      console.log(`   Статус: ${state.lastBuild.status || 'unknown'}`);
      if (state.lastBuild.version) {
        console.log(`   Версия: ${state.lastBuild.version}`);
      }
      if (state.lastBuild.timestamp) {
        console.log(`   Время: ${state.lastBuild.timestamp}`);
      }
    } else {
      console.log('   (нет данных)');
    }
    
    console.log('\n📍 Текущее происхождение данных:');
    console.log(`   Источник: ${state.currentDataOrigin.source}`);
    if (state.currentDataOrigin.reference) {
      console.log(`   Ссылка: ${state.currentDataOrigin.reference}`);
    } else {
      console.log('   Ссылка: (не установлена)');
    }
    if (state.currentDataOrigin.timestamp) {
      console.log(`   Время: ${state.currentDataOrigin.timestamp}`);
    } else {
      console.log('   Время: (не установлено)');
    }
    
    logger.logSeparator();
    logger.logSuccess('Статус загружен успешно');
    logger.logSeparator();
    console.log('');
    
    return 0;
  } catch (error) {
    logger.logError(`Ошибка загрузки статуса: ${error.message}`);
    return 1;
  }
}

/**
 * Выполняет восстановление из снимка версии
 * @param {string} version - идентификатор версии
 * @param {boolean} dryRun - режим пробного запуска
 */
function handleRestore(version, dryRun = false) {
  if (!version) {
    logger.logError('Не указана версия для восстановления');
    console.log('\nИспользование: iwdc-recovery restore <version> [--dry-run]');
    return 1;
  }
  
  try {
    const result = restoreFromSnapshot({
      version: version,
      dryRun: dryRun,
      backup: true
    });
    
    if (dryRun) {
      logger.logSeparator();
      logger.logInfo('DRY RUN завершён. Изменения не применены.');
      logger.logSeparator();
    } else {
      logger.logSeparator();
      logger.logSuccess('Восстановление завершено успешно');
      if (result.backupPath) {
        logger.logInfo(`Резервная копия: ${result.backupPath}`);
      }
      logger.logSeparator();
    }
    
    console.log('');
    return 0;
  } catch (error) {
    logger.logError(`Ошибка восстановления: ${error.message}`);
    return 1;
  }
}

/**
 * Выполняет откат к версии
 * @param {string|null} version - идентификатор версии (или null для последней успешной)
 * @param {boolean} dryRun - режим пробного запуска
 */
function handleRollback(version, dryRun = false) {
  try {
    let targetVersion = version;
    
    // Если версия не указана, используем последнюю успешную
    if (!targetVersion) {
      const state = loadRecoveryState();
      if (!state.lastSuccessfulVersion) {
        logger.logError('Не указана версия и не найдена последняя успешная версия');
        console.log('\nИспользование: iwdc-recovery rollback [<version>] [--dry-run]');
        return 1;
      }
      targetVersion = state.lastSuccessfulVersion;
      logger.logInfo(`Используется последняя успешная версия: ${targetVersion}`);
    }
    
    const result = rollbackToVersion({
      version: targetVersion,
      dryRun: dryRun,
      backup: true
    });
    
    if (dryRun) {
      logger.logSeparator();
      logger.logInfo('DRY RUN завершён. Изменения не применены.');
      logger.logSeparator();
    } else {
      logger.logSeparator();
      logger.logSuccess('Откат завершён успешно');
      if (result.backupPath) {
        logger.logInfo(`Резервная копия: ${result.backupPath}`);
      }
      logger.logSeparator();
    }
    
    console.log('');
    return 0;
  } catch (error) {
    logger.logError(`Ошибка отката: ${error.message}`);
    return 1;
  }
}

/**
 * Обрабатывает команду doctor
 * @param {boolean} apply - применять ли автоматический ремонт
 * @param {boolean} autoRepair - использовать ли авторемонт
 */
async function handleDoctor(apply = false, autoRepair = false) {
  try {
    const report = await runDoctor({ apply, autoRepair });
    
    // Краткий summary
    logger.logSeparator();
    logger.logSection('КРАТКИЙ ОТЧЁТ', '📊');
    
    console.log('\n✅ Валидация:');
    const validationStatus = report.diagnostics.validation?.status || 'unknown';
    const validationErrors = report.diagnostics.validation?.totalErrors || 0;
    console.log(`   Статус: ${validationStatus}`);
    if (validationErrors > 0) {
      console.log(`   Ошибок: ${validationErrors}`);
    }
    
    console.log('\n✅ BC-аудит:');
    const bcStatus = report.diagnostics.bcAudit?.status || 'unknown';
    const bcErrors = report.diagnostics.bcAudit?.errors || 0;
    console.log(`   Статус: ${bcStatus}`);
    if (bcErrors > 0) {
      console.log(`   Ошибок: ${bcErrors}`);
    }
    
    console.log('\n✅ Авторемонт:');
    console.log(`   Доступен: ${report.analysis.canAutoRepair ? 'да' : 'нет'}`);
    if (report.repairPlan) {
      console.log(`   План создан: ${report.repairPlan.operationsCount} операций`);
      if (report.repairApplied) {
        console.log(`   План применён: да`);
      }
    }
    
    // Путь к отчёту (определяем из сохранённого файла)
    const reportsDir = path.join(process.cwd(), "data", "recovery", "doctor-reports");
    const timestamp = report.timestamp.replace(/[:.]/g, '-').slice(0, -5);
    const reportFile = path.join(reportsDir, `doctor-${timestamp}.json`);
    
    console.log('\n✅ Отчёт:');
    console.log(`   Файл: ${reportFile}`);
    
    logger.logSeparator();
    console.log('');
    
    return 0;
  } catch (error) {
    logger.logError(`Критическая ошибка диагностики: ${error.message}`);
    return 1;
  }
}

/**
 * Основная функция CLI
 */
function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('IWDC Recovery CLI');
    console.log('\nИспользование:');
    console.log('  iwdc-recovery status');
    console.log('  iwdc-recovery restore <version> [--dry-run]');
    console.log('  iwdc-recovery rollback [<version>] [--dry-run]');
    console.log('  iwdc-recovery doctor [--apply] [--auto-repair]');
    console.log('\nФлаги:');
    console.log('  --dry-run      Пробный запуск без применения изменений');
    console.log('  --apply        Применить автоматический ремонт (для doctor)');
    console.log('  --auto-repair  Использовать авторемонт при обнаружении проблем (для doctor)');
    process.exit(1);
  }
  
  const command = args[0];
  const hasDryRun = args.includes('--dry-run');
  const hasApply = args.includes('--apply');
  const hasAutoRepair = args.includes('--auto-repair');
  
  let exitCode = 0;
  
  try {
    switch (command) {
      case 'status':
        exitCode = showStatus();
        break;
        
      case 'restore':
        const restoreVersion = args[1];
        if (!restoreVersion || restoreVersion === '--dry-run') {
          logger.logError('Не указана версия для восстановления');
          console.log('\nИспользование: iwdc-recovery restore <version> [--dry-run]');
          exitCode = 1;
        } else {
          exitCode = handleRestore(restoreVersion, hasDryRun);
        }
        break;
        
      case 'rollback':
        // Версия может быть указана или использоваться последняя успешная
        const rollbackVersion = args[1] && args[1] !== '--dry-run' ? args[1] : null;
        exitCode = handleRollback(rollbackVersion, hasDryRun);
        break;
        
      case 'doctor':
        // Асинхронная команда, нужно обработать через async/await
        handleDoctor(hasApply, hasAutoRepair).then(exitCode => {
          process.exit(exitCode);
        }).catch(error => {
          logger.logError(`Критическая ошибка: ${error.message}`);
          process.exit(1);
        });
        return; // Выходим, т.к. process.exit будет вызван в then/catch
        
      default:
        logger.logError(`Неизвестная команда: ${command}`);
        console.log('\nДоступные команды: status, restore, rollback, doctor');
        exitCode = 1;
    }
  } catch (error) {
    logger.logError(`Критическая ошибка: ${error.message}`);
    exitCode = 1;
  }
  
  process.exit(exitCode);
}

// Запуск, если файл выполняется напрямую
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default main;

