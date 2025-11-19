// Утилиты IWDC v0.6
import * as logger from "../../utils/logger.mjs";
import { runPredictiveAnalysis } from "../../scripts/predictive/predictive-core.mjs";

/**
 * CLI для предиктивного анализа IWDC v0.8
 * 
 * Predictive Integrity Layer анализирует данные ДО основной сборки,
 * предсказывая потенциальные проблемы и нарушения целостности.
 * 
 * Команды:
 *   analyze [--version <version>] [--strict] - запустить предиктивный анализ
 *   report [--latest] - показать последний отчёт
 */

/**
 * Выводит краткий summary результатов анализа
 * @param {object} result - результат предиктивного анализа
 */
function showAnalysisSummary(result) {
  logger.logSeparator();
  logger.logSection('РЕЗУЛЬТАТЫ ПРЕДИКТИВНОГО АНАЛИЗА', '📊');
  logger.logSeparator();
  
  console.log('\n✅ Статус:');
  console.log(`   ${result.status.toUpperCase()}`);
  
  if (result.lastSuccessfulVersion) {
    console.log(`\n✅ Версия для сравнения: ${result.lastSuccessfulVersion}`);
  } else {
    console.log(`\n⚠️  Версия для сравнения: не установлена`);
  }
  
  console.log('\n✅ Статистика:');
  console.log(`   Предупреждений: ${result.summary.totalWarnings}`);
  console.log(`   Ошибок: ${result.summary.totalErrors}`);
  console.log(`   Критичных проблем: ${result.summary.criticalIssues}`);
  
  // Детали по модулям
  if (result.heuristics) {
    console.log('\n✅ Эвристики:');
    console.log(`   Предупреждений: ${result.heuristics.stats.totalWarnings}`);
    console.log(`   Ошибок: ${result.heuristics.stats.totalErrors}`);
  }
  
  if (result.idConsistency) {
    console.log('\n✅ Консистентность ID/slug:');
    console.log(`   Предупреждений: ${result.idConsistency.stats.totalWarnings}`);
    console.log(`   Ошибок: ${result.idConsistency.stats.totalErrors}`);
  }
  
  if (result.predictiveDiff) {
    console.log('\n✅ Предиктивный diff:');
    console.log(`   Добавлено: ${result.predictiveDiff.stats.totalAdded}`);
    console.log(`   Удалено: ${result.predictiveDiff.stats.totalRemoved}`);
    console.log(`   Изменено: ${result.predictiveDiff.stats.totalChanged}`);
    console.log(`   Подозрительных изменений: ${result.predictiveDiff.stats.totalSuspicious}`);
  }
  
  // Критичные ошибки
  if (result.errors.length > 0) {
    console.log('\n❌ Критичные ошибки:');
    result.errors.slice(0, 10).forEach((error, index) => {
      console.log(`   [${index + 1}] ${error.type}: ${error.message}`);
      if (error.category) {
        console.log(`       Категория: ${error.category}`);
      }
      if (error.id) {
        console.log(`       ID: ${error.id}`);
      }
    });
    if (result.errors.length > 10) {
      console.log(`   ... и ещё ${result.errors.length - 10} ошибок`);
    }
  }
  
  // Важные предупреждения
  if (result.warnings.length > 0 && result.warnings.length <= 20) {
    console.log('\n⚠️  Предупреждения:');
    result.warnings.slice(0, 10).forEach((warning, index) => {
      console.log(`   [${index + 1}] ${warning.type}: ${warning.message}`);
      if (warning.category) {
        console.log(`       Категория: ${warning.category}`);
      }
    });
    if (result.warnings.length > 10) {
      console.log(`   ... и ещё ${result.warnings.length - 10} предупреждений`);
    }
  }
  
  // Пути к файлам
  if (result.reportPath) {
    console.log('\n✅ Отчёт:');
    console.log(`   JSON: ${result.reportPath}`);
  }
  
  if (result.logPath) {
    console.log(`   Лог: ${result.logPath}`);
  }
  
  logger.logSeparator();
  console.log('');
}

/**
 * Обрабатывает команду analyze
 * @param {string} version - версия для сравнения (опционально)
 * @param {boolean} strict - строгий режим
 */
async function handleAnalyze(version = null, strict = false) {
  try {
    const result = await runPredictiveAnalysis({
      lastSuccessfulVersion: version,
      strict: strict
    });
    
    showAnalysisSummary(result);
    
    // Exit code: 0 если нет ошибок, 1 если есть ошибки
    return result.summary.totalErrors === 0 ? 0 : 1;
  } catch (error) {
    logger.logError(`Критическая ошибка предиктивного анализа: ${error.message}`);
    return 1;
  }
}

/**
 * Обрабатывает команду report (показывает последний отчёт)
 */
function handleReport() {
  try {
    const reportsDir = path.join(process.cwd(), "data", "predictive", "reports");
    
    if (!fs.existsSync(reportsDir)) {
      logger.logError('Директория отчётов не найдена');
      return 1;
    }
    
    const files = fs.readdirSync(reportsDir)
      .filter(file => file.endsWith('.json'))
      .map(file => ({
        name: file,
        path: path.join(reportsDir, file),
        time: fs.statSync(path.join(reportsDir, file)).mtime
      }))
      .sort((a, b) => b.time - a.time);
    
    if (files.length === 0) {
      logger.logWarning('Отчёты не найдены');
      return 1;
    }
    
    const latestReport = files[0];
    logger.logInfo(`Последний отчёт: ${latestReport.name}`);
    logger.logInfo(`Путь: ${latestReport.path}`);
    logger.logInfo(`Время: ${latestReport.time.toISOString()}`);
    
    // Загружаем и показываем краткую информацию
    const reportContent = JSON.parse(fs.readFileSync(latestReport.path, 'utf-8'));
    console.log('\n📊 Краткая информация:');
    console.log(`   Статус: ${reportContent.status}`);
    console.log(`   Предупреждений: ${reportContent.summary.totalWarnings}`);
    console.log(`   Ошибок: ${reportContent.summary.totalErrors}`);
    
    return 0;
  } catch (error) {
    logger.logError(`Ошибка загрузки отчёта: ${error.message}`);
    return 1;
  }
}

/**
 * Основная функция CLI
 */
function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('IWDC Predictive Integrity Layer CLI');
    console.log('\nИспользование:');
    console.log('  iwdc-predict analyze [--version <version>] [--strict]');
    console.log('  iwdc-predict report');
    console.log('\nКоманды:');
    console.log('  analyze          Запустить предиктивный анализ');
    console.log('  report           Показать последний отчёт');
    console.log('\nФлаги:');
    console.log('  --version <ver>   Использовать указанную версию для сравнения');
    console.log('  --strict          Строгий режим (прерывать при критических проблемах)');
    process.exit(1);
  }
  
  const command = args[0];
  let exitCode = 0;
  
  try {
    switch (command) {
      case 'analyze':
        // Парсим аргументы
        let version = null;
        let strict = false;
        
        for (let i = 1; i < args.length; i++) {
          if (args[i] === '--version' && i + 1 < args.length) {
            version = args[i + 1];
            i++;
          } else if (args[i] === '--strict') {
            strict = true;
          }
        }
        
        // Асинхронная команда
        handleAnalyze(version, strict).then(code => {
          process.exit(code);
        }).catch(error => {
          logger.logError(`Критическая ошибка: ${error.message}`);
          process.exit(1);
        });
        return; // Выходим, т.к. process.exit будет вызван в then/catch
        
      case 'report':
        exitCode = handleReport();
        break;
        
      default:
        logger.logError(`Неизвестная команда: ${command}`);
        console.log('\nДоступные команды: analyze, report');
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

