// Утилиты IWDC v0.6
import * as logger from "../../utils/logger.mjs";
import { startLiveWatcher, stopLiveWatcher } from "../../scripts/live-delta/watcher.mjs";

/**
 * CLI для Live Delta Layer IWDC v0.9
 * 
 * Запускает мониторинг файлов в data/json/ и автоматически
 * выполняет валидацию и diff при изменении файлов
 */

/**
 * Обработка сигналов завершения
 */
function setupSignalHandlers() {
  const shutdown = () => {
    logger.logInfo('\nПолучен сигнал завершения, останавливаем watcher...');
    stopLiveWatcher();
    process.exit(0);
  };
  
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

/**
 * Основная функция CLI
 */
function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose') || args.includes('-v');
  
  logger.logHeader('IWDC Live Delta Layer', '⚡');
  
  // Настройка обработчиков сигналов
  setupSignalHandlers();
  
  // Запуск watcher
  try {
    const watcher = startLiveWatcher({ verbose });
    
    // Watcher работает до получения сигнала завершения
    logger.logInfo('Для остановки нажмите Ctrl+C');
    
  } catch (error) {
    logger.logError(`Критическая ошибка: ${error.message}`);
    process.exit(1);
  }
}

// Запуск, если файл выполняется напрямую
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default main;


