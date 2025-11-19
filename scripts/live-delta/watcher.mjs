import chokidar from "chokidar";
import path from "path";
// Утилиты IWDC v0.6
import * as paths from "../../utils/paths.mjs";
import * as logger from "../../utils/logger.mjs";
import { runLiveValidation } from "./live-validate.mjs";
import { buildLiveDiff } from "./live-diff.mjs";
import { printLiveReport, writeLiveLog } from "./live-report.mjs";

/**
 * Модуль наблюдения за файлами IWDC v0.9
 * 
 * Использует chokidar для мониторинга изменений в data/json/
 * и автоматической валидации и diff при изменении файлов
 */

let watcher = null;
let isRunning = false;

/**
 * Обрабатывает изменение файла
 */
async function handleFileChange(filePath) {
  try {
    // Определяем, что файл действительно JSON
    if (!filePath.endsWith('.json')) {
      return;
    }
    
    // Проверяем, что файл в нужной директории
    const normalizedPath = filePath.replace(/\\/g, '/');
    if (!normalizedPath.includes('/data/json/')) {
      return;
    }
    
    logger.logInfo(`Обнаружено изменение: ${path.basename(filePath)}`);
    
    // Выполняем валидацию
    const validation = await runLiveValidation(filePath);
    
    // Выполняем diff (если файл валиден)
    let diff = null;
    if (validation.status !== "error" || validation.errors.length === 0) {
      try {
        diff = await buildLiveDiff(filePath);
      } catch (diffError) {
        logger.logWarning(`Ошибка построения diff: ${diffError.message}`);
      }
    }
    
    // Выводим отчёт
    printLiveReport(validation, diff);
    
    // Записываем лог
    writeLiveLog(validation, diff);
    
  } catch (error) {
    logger.logError(`Ошибка обработки файла ${filePath}: ${error.message}`);
  }
}

/**
 * Запускает watcher для наблюдения за файлами
 * @param {object} options - параметры
 * @param {boolean} options.verbose - подробный вывод
 * @returns {object} Объект watcher
 */
export function startLiveWatcher({ verbose = false } = {}) {
  if (isRunning) {
    logger.logWarning('Watcher уже запущен');
    return watcher;
  }
  
  logger.logHeader('Live Delta Layer - Запуск мониторинга', '⚡');
  
  // Пути для наблюдения
  const watchPaths = [
    path.join(paths.getDataJsonPath("series"), "**", "*.json"),
    path.join(paths.getDataJsonPath("models"), "**", "*.json"),
    path.join(paths.getDataJsonPath("lengths"), "**", "*.json")
  ];
  
  logger.logInfo('Наблюдение за файлами:');
  watchPaths.forEach(watchPath => {
    logger.logInfo(`  ${watchPath}`);
  });
  
  // Создаём watcher
  watcher = chokidar.watch(watchPaths, {
    ignored: /(^|[\/\\])\../, // Игнорируем скрытые файлы
    persistent: true,
    ignoreInitial: true, // Не обрабатываем существующие файлы при запуске
    awaitWriteFinish: {
      stabilityThreshold: 500, // Ждём 500ms после последнего изменения
      pollInterval: 100
    }
  });
  
  // Обработчики событий
  watcher.on('change', async (filePath) => {
    if (verbose) {
      logger.logInfo(`Файл изменён: ${filePath}`);
    }
    await handleFileChange(filePath);
  });
  
  watcher.on('add', async (filePath) => {
    if (verbose) {
      logger.logInfo(`Файл добавлен: ${filePath}`);
    }
    await handleFileChange(filePath);
  });
  
  watcher.on('unlink', (filePath) => {
    if (verbose) {
      logger.logWarning(`Файл удалён: ${filePath}`);
    }
    logger.logWarning(`Файл удалён: ${path.basename(filePath)}`);
  });
  
  watcher.on('error', (error) => {
    logger.logError(`Ошибка watcher: ${error.message}`);
  });
  
  watcher.on('ready', () => {
    logger.logSuccess('Live Delta Layer запущен и готов к мониторингу');
    logger.logInfo('Ожидание изменений файлов...');
    logger.logSeparator();
    console.log('');
  });
  
  isRunning = true;
  
  return watcher;
}

/**
 * Останавливает watcher
 */
export function stopLiveWatcher() {
  if (!watcher || !isRunning) {
    return;
  }
  
  watcher.close();
  watcher = null;
  isRunning = false;
  
  logger.logInfo('Live Delta Layer остановлен');
}

/**
 * Экспорт для использования в других модулях
 */
export default { startLiveWatcher, stopLiveWatcher };


