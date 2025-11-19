import fs from "fs";
import path from "path";
// Утилиты IWDC v0.6
import * as paths from "../../utils/paths.mjs";
import * as logger from "../../utils/logger.mjs";
import { loadRecoveryState, saveRecoveryState } from "./state.mjs";

/**
 * Рекурсивно копирует директорию
 * @param {string} src - исходная директория
 * @param {string} dest - целевая директория
 */
function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) {
    throw new Error(`Исходная директория не найдена: ${src}`);
  }
  
  // Создаём целевую директорию
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Рекурсивно удаляет директорию
 * @param {string} dirPath - путь к директории
 */
function removeDirRecursive(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return;
  }
  
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  
  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    
    if (entry.isDirectory()) {
      removeDirRecursive(entryPath);
    } else {
      fs.unlinkSync(entryPath);
    }
  }
  
  fs.rmdirSync(dirPath);
}

/**
 * Проверяет существование версии в data/versions
 * @param {string} version - идентификатор версии
 * @returns {boolean} true если версия существует
 */
function versionExists(version) {
  const versionPath = paths.getVersionPath(version);
  const versionJsonPath = path.join(versionPath, "json");
  
  return fs.existsSync(versionPath) && fs.existsSync(versionJsonPath);
}

/**
 * Создаёт резервную копию data/json
 * @param {string} prefix - префикс для имени бэкапа (например, "before-restore")
 * @returns {string} Путь к созданной резервной копии
 */
function createBackup(prefix = "backup") {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const backupDir = path.join(process.cwd(), "data", "recovery", "backups", `${timestamp}-${prefix}`);
  
  // Создаём директорию для бэкапов, если её нет
  const backupsDir = path.dirname(backupDir);
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }
  
  const dataJsonPath = paths.getDataJsonPath();
  
  logger.logInfo(`Создание резервной копии: ${backupDir}`);
  copyDirRecursive(dataJsonPath, backupDir);
  logger.logSuccess(`Резервная копия создана: ${backupDir}`);
  
  return backupDir;
}

/**
 * Восстанавливает data/json из снимка версии
 * @param {object} options - параметры восстановления
 * @param {string} options.version - идентификатор версии для восстановления
 * @param {boolean} options.dryRun - режим пробного запуска (не записывает изменения)
 * @param {boolean} options.backup - создавать ли резервную копию перед восстановлением
 * @returns {object} Результат операции
 */
export function restoreFromSnapshot({ version, dryRun = false, backup = true }) {
  logger.logStep(`ВОССТАНОВЛЕНИЕ ИЗ СНИМКА: ${version}`, '🔄');
  
  if (dryRun) {
    logger.logInfo('Режим DRY RUN: изменения не будут применены');
  }
  
  try {
    // Проверка существования версии
    if (!versionExists(version)) {
      throw new Error(`Версия ${version} не найдена в data/versions/${version}/json`);
    }
    
    const versionPath = paths.getVersionPath(version);
    const versionJsonPath = path.join(versionPath, "json");
    const dataJsonPath = paths.getDataJsonPath();
    
    logger.logInfo(`Версия найдена: ${versionPath}`);
    logger.logInfo(`Целевая директория: ${dataJsonPath}`);
    
    let backupPath = null;
    
    // Создание резервной копии
    if (backup && !dryRun) {
      backupPath = createBackup("before-restore");
    } else if (backup && dryRun) {
      logger.logInfo(`[DRY RUN] Будет создана резервная копия в data/recovery/backups/`);
    }
    
    // Категории для восстановления
    const categories = ['series', 'models', 'lengths'];
    
    if (!dryRun) {
      // Удаляем существующие категории
      for (const category of categories) {
        const categoryPath = path.join(dataJsonPath, category);
        if (fs.existsSync(categoryPath)) {
          logger.logInfo(`Удаление существующей директории: ${category}`);
          removeDirRecursive(categoryPath);
        }
      }
      
      // Копируем категории из версии
      for (const category of categories) {
        const srcCategoryPath = path.join(versionJsonPath, category);
        const destCategoryPath = path.join(dataJsonPath, category);
        
        if (fs.existsSync(srcCategoryPath)) {
          logger.logInfo(`Копирование ${category}/ из версии...`);
          copyDirRecursive(srcCategoryPath, destCategoryPath);
          logger.logSuccess(`Категория ${category}/ восстановлена`);
        } else {
          logger.logWarning(`Категория ${category}/ отсутствует в версии, пропуск`);
        }
      }
      
      // Обновляем recovery state
      const state = loadRecoveryState();
      state.currentDataOrigin = {
        source: "version",
        reference: `version:${version}`,
        timestamp: new Date().toISOString()
      };
      saveRecoveryState(state);
      
      logger.logSuccess(`Восстановление завершено: версия ${version}`);
      logger.logInfo(`Recovery state обновлён`);
    } else {
      // Dry run: только логирование
      logger.logInfo(`[DRY RUN] Будет удалено содержимое: ${categories.join(', ')}`);
      for (const category of categories) {
        const srcCategoryPath = path.join(versionJsonPath, category);
        if (fs.existsSync(srcCategoryPath)) {
          logger.logInfo(`[DRY RUN] Будет скопировано: ${category}/`);
        }
      }
      logger.logInfo(`[DRY RUN] Recovery state будет обновлён`);
    }
    
    return {
      success: true,
      version: version,
      backupPath: backupPath,
      dryRun: dryRun
    };
    
  } catch (error) {
    logger.logError(`Ошибка восстановления из снимка: ${error.message}`);
    throw error;
  }
}

/**
 * Откатывает data/json к указанной версии
 * @param {object} options - параметры отката
 * @param {string} options.version - идентификатор версии для отката
 * @param {boolean} options.dryRun - режим пробного запуска (не записывает изменения)
 * @param {boolean} options.backup - создавать ли резервную копию перед откатом
 * @returns {object} Результат операции
 */
export function rollbackToVersion({ version, dryRun = false, backup = true }) {
  logger.logStep(`ОТКАТ К ВЕРСИИ: ${version}`, '⏪');
  
  if (dryRun) {
    logger.logInfo('Режим DRY RUN: изменения не будут применены');
  }
  
  try {
    // Проверка существования версии
    if (!versionExists(version)) {
      throw new Error(`Версия ${version} не найдена в data/versions/${version}/json`);
    }
    
    const versionPath = paths.getVersionPath(version);
    const versionJsonPath = path.join(versionPath, "json");
    const dataJsonPath = paths.getDataJsonPath();
    
    logger.logInfo(`Версия найдена: ${versionPath}`);
    logger.logInfo(`Целевая директория: ${dataJsonPath}`);
    
    let backupPath = null;
    
    // Создание резервной копии
    if (backup && !dryRun) {
      backupPath = createBackup("before-rollback");
    } else if (backup && dryRun) {
      logger.logInfo(`[DRY RUN] Будет создана резервная копия в data/recovery/backups/`);
    }
    
    // Категории для отката
    const categories = ['series', 'models', 'lengths'];
    
    if (!dryRun) {
      // Удаляем существующие категории
      for (const category of categories) {
        const categoryPath = path.join(dataJsonPath, category);
        if (fs.existsSync(categoryPath)) {
          logger.logInfo(`Удаление существующей директории: ${category}`);
          removeDirRecursive(categoryPath);
        }
      }
      
      // Копируем категории из версии
      for (const category of categories) {
        const srcCategoryPath = path.join(versionJsonPath, category);
        const destCategoryPath = path.join(dataJsonPath, category);
        
        if (fs.existsSync(srcCategoryPath)) {
          logger.logInfo(`Копирование ${category}/ из версии...`);
          copyDirRecursive(srcCategoryPath, destCategoryPath);
          logger.logSuccess(`Категория ${category}/ откачена`);
        } else {
          logger.logWarning(`Категория ${category}/ отсутствует в версии, пропуск`);
        }
      }
      
      // Обновляем recovery state
      const state = loadRecoveryState();
      state.currentDataOrigin = {
        source: "version",
        reference: `version:${version}`,
        timestamp: new Date().toISOString()
      };
      saveRecoveryState(state);
      
      logger.logSuccess(`Откат завершён: версия ${version}`);
      logger.logInfo(`Recovery state обновлён`);
    } else {
      // Dry run: только логирование
      logger.logInfo(`[DRY RUN] Будет удалено содержимое: ${categories.join(', ')}`);
      for (const category of categories) {
        const srcCategoryPath = path.join(versionJsonPath, category);
        if (fs.existsSync(srcCategoryPath)) {
          logger.logInfo(`[DRY RUN] Будет скопировано: ${category}/`);
        }
      }
      logger.logInfo(`[DRY RUN] Recovery state будет обновлён`);
    }
    
    return {
      success: true,
      version: version,
      backupPath: backupPath,
      dryRun: dryRun
    };
    
  } catch (error) {
    logger.logError(`Ошибка отката к версии: ${error.message}`);
    throw error;
  }
}


