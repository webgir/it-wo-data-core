import fs from "fs";
import path from "path";
// Утилиты IWDC v0.6
import * as paths from "../../utils/paths.mjs";
import { loadJsonMap, readJsonFile, writeJsonFile } from "../../utils/file.mjs";
import * as logger from "../../utils/logger.mjs";
import { loadRecoveryState, saveRecoveryState } from "./state.mjs";

/**
 * Рекурсивно копирует директорию (для backup)
 */
function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) {
    throw new Error(`Исходная директория не найдена: ${src}`);
  }
  
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
 * Создаёт резервную копию data/json
 */
function createBackup(prefix = "backup") {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const backupDir = path.join(process.cwd(), "data", "recovery", "backups", `${timestamp}-${prefix}`);
  
  const backupsDir = path.dirname(backupDir);
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }
  
  const dataJsonPath = paths.getDataJsonPath();
  copyDirRecursive(dataJsonPath, backupDir);
  
  return backupDir;
}

/**
 * Сравнивает типы двух значений
 */
function compareTypes(value1, value2) {
  const type1 = typeof value1;
  const type2 = typeof value2;
  
  if (value1 === null || value1 === undefined) {
    return (value2 === null || value2 === undefined);
  }
  if (value2 === null || value2 === undefined) {
    return false;
  }
  
  if (Array.isArray(value1) && Array.isArray(value2)) {
    return true;
  }
  if (Array.isArray(value1) || Array.isArray(value2)) {
    return false;
  }
  
  if (type1 === 'object' && type2 === 'object') {
    return true;
  }
  
  return type1 === type2;
}

/**
 * Преобразует значение к нужному типу
 */
function coerceType(value, targetType) {
  if (targetType === 'number') {
    return Number(value);
  }
  if (targetType === 'string') {
    return String(value);
  }
  if (targetType === 'boolean') {
    return Boolean(value);
  }
  if (targetType === 'array' && !Array.isArray(value)) {
    return [value];
  }
  return value;
}

/**
 * Строит план восстановления данных
 * @param {object} options - параметры
 * @param {string} options.currentDir - путь к текущим данным (по умолчанию data/json)
 * @param {string} options.previousVersion - идентификатор предыдущей версии
 * @returns {object} План восстановления
 */
export function buildRepairPlan({ currentDir = null, previousVersion }) {
  logger.logStep(`ПОСТРОЕНИЕ ПЛАНА ВОССТАНОВЛЕНИЯ: ${previousVersion}`, '🔧');
  
  try {
    // Загружаем текущие данные
    const currentDataPath = currentDir || paths.getDataJsonPath();
    logger.logInfo(`Загрузка текущих данных из: ${currentDataPath}`);
    
    const currentSeries = loadJsonMap(path.join(currentDataPath, "series"));
    const currentModels = loadJsonMap(path.join(currentDataPath, "models"));
    const currentLengths = loadJsonMap(path.join(currentDataPath, "lengths"));
    
    // Загружаем данные предыдущего snapshot
    const previousVersionPath = paths.getVersionPath(previousVersion);
    const previousJsonPath = path.join(previousVersionPath, "json");
    
    if (!fs.existsSync(previousJsonPath)) {
      throw new Error(`Предыдущая версия не найдена: ${previousJsonPath}`);
    }
    
    logger.logInfo(`Загрузка данных из версии: ${previousVersionPath}`);
    
    const previousSeries = loadJsonMap(path.join(previousJsonPath, "series"));
    const previousModels = loadJsonMap(path.join(previousJsonPath, "models"));
    const previousLengths = loadJsonMap(path.join(previousJsonPath, "lengths"));
    
    const operations = [];
    const summary = {
      entitiesRestored: 0,
      fieldsRestored: 0,
      typeCorrections: 0
    };
    
    // Функция для сравнения категории
    function compareCategory(currentMap, previousMap, category) {
      // A) Удалённые сущности → restoreEntity
      for (const [id, previousItem] of previousMap.entries()) {
        if (!currentMap.has(id)) {
          operations.push({
            type: "restoreEntity",
            category: category,
            id: id,
            entity: previousItem
          });
          summary.entitiesRestored++;
        } else {
          // B) Удалённые поля → restoreField
          const currentItem = currentMap.get(id);
          for (const [field, previousValue] of Object.entries(previousItem)) {
            // Пропускаем служебные поля
            if (field === 'meta' || field === 'updated_at' || field === 'data_version') {
              continue;
            }
            
            if (!(field in currentItem)) {
              operations.push({
                type: "restoreField",
                category: category,
                id: id,
                field: field,
                value: previousValue
              });
              summary.fieldsRestored++;
            } else {
              // C) Несовпадение типов → typeCoercion
              const currentValue = currentItem[field];
              if (!compareTypes(currentValue, previousValue)) {
                const targetType = typeof previousValue;
                operations.push({
                  type: "typeCoercion",
                  category: category,
                  id: id,
                  field: field,
                  currentValue: currentValue,
                  targetValue: previousValue,
                  targetType: targetType
                });
                summary.typeCorrections++;
              }
            }
          }
        }
      }
    }
    
    // Сравниваем каждую категорию
    compareCategory(currentSeries, previousSeries, "series");
    compareCategory(currentModels, previousModels, "models");
    compareCategory(currentLengths, previousLengths, "lengths");
    
    // Формируем план
    const timestamp = new Date().toISOString();
    const plan = {
      previousVersion: previousVersion,
      generatedAt: timestamp,
      summary: summary,
      operations: operations
    };
    
    // Сохраняем план
    const plansDir = path.join(process.cwd(), "data", "recovery", "repair-plans");
    if (!fs.existsSync(plansDir)) {
      fs.mkdirSync(plansDir, { recursive: true });
    }
    
    const planTimestamp = timestamp.replace(/[:.]/g, '-').slice(0, -5);
    const planFileName = `${planTimestamp}-from-${previousVersion}.json`;
    const planPath = path.join(plansDir, planFileName);
    
    writeJsonFile(planPath, plan);
    plan.file = planPath;
    
    logger.logSuccess(`План восстановления создан: ${planPath}`);
    logger.logInfo(`Операций: ${operations.length} (сущностей: ${summary.entitiesRestored}, полей: ${summary.fieldsRestored}, типов: ${summary.typeCorrections})`);
    
    return plan;
    
  } catch (error) {
    logger.logError(`Ошибка построения плана: ${error.message}`);
    throw error;
  }
}

/**
 * Применяет план восстановления
 * @param {object} plan - план восстановления
 * @param {object} options - параметры
 * @param {boolean} options.dryRun - режим пробного запуска
 * @returns {object} Результат применения
 */
export function applyRepairPlan(plan, { dryRun = false }) {
  logger.logStep(`ПРИМЕНЕНИЕ ПЛАНА ВОССТАНОВЛЕНИЯ`, '⚙️');
  
  if (dryRun) {
    logger.logInfo('Режим DRY RUN: изменения не будут применены');
  }
  
  try {
    const dataJsonPath = paths.getDataJsonPath();
    let backupPath = null;
    
    // Создаём backup
    if (!dryRun) {
      backupPath = createBackup("before-repair");
      logger.logSuccess(`Резервная копия создана: ${backupPath}`);
    } else {
      logger.logInfo(`[DRY RUN] Будет создана резервная копия в data/recovery/backups/`);
    }
    
    // Загружаем текущие данные
    const currentSeries = loadJsonMap(path.join(dataJsonPath, "series"));
    const currentModels = loadJsonMap(path.join(dataJsonPath, "models"));
    const currentLengths = loadJsonMap(path.join(dataJsonPath, "lengths"));
    
    const maps = {
      series: currentSeries,
      models: currentModels,
      lengths: currentLengths
    };
    
    // Применяем операции
    for (const operation of plan.operations) {
      const map = maps[operation.category];
      
      if (!map) {
        logger.logWarning(`Неизвестная категория: ${operation.category}, пропуск операции`);
        continue;
      }
      
      if (operation.type === "restoreEntity") {
        if (dryRun) {
          logger.logInfo(`[DRY RUN] Будет восстановлена сущность: ${operation.category}/${operation.id}`);
        } else {
          map.set(operation.id, operation.entity);
          logger.logInfo(`Восстановлена сущность: ${operation.category}/${operation.id}`);
        }
      } else if (operation.type === "restoreField") {
        if (dryRun) {
          logger.logInfo(`[DRY RUN] Будет восстановлено поле: ${operation.category}/${operation.id}.${operation.field}`);
        } else {
          const entity = map.get(operation.id);
          if (entity) {
            entity[operation.field] = operation.value;
            logger.logInfo(`Восстановлено поле: ${operation.category}/${operation.id}.${operation.field}`);
          }
        }
      } else if (operation.type === "typeCoercion") {
        if (dryRun) {
          logger.logInfo(`[DRY RUN] Будет исправлен тип: ${operation.category}/${operation.id}.${operation.field} → ${operation.targetType}`);
        } else {
          const entity = map.get(operation.id);
          if (entity) {
            entity[operation.field] = coerceType(operation.currentValue, operation.targetType);
            logger.logInfo(`Исправлен тип: ${operation.category}/${operation.id}.${operation.field} → ${operation.targetType}`);
          }
        }
      }
    }
    
    // Сохраняем обновлённые данные
    if (!dryRun) {
      // Сохраняем каждую категорию
      for (const [category, map] of Object.entries(maps)) {
        const categoryPath = path.join(dataJsonPath, category);
        if (!fs.existsSync(categoryPath)) {
          fs.mkdirSync(categoryPath, { recursive: true });
        }
        
        // Сохраняем каждый объект как отдельный файл (или в общий файл, в зависимости от структуры)
        // Для упрощения: сохраняем все объекты в один массив в файле
        const items = Array.from(map.values());
        const categoryFile = path.join(categoryPath, `${category}.json`);
        writeJsonFile(categoryFile, items);
      }
      
      // Обновляем recovery state
      const state = loadRecoveryState();
      state.currentDataOrigin = {
        source: "repair",
        reference: plan.file || `plan-${plan.generatedAt}`,
        timestamp: new Date().toISOString()
      };
      saveRecoveryState(state);
      
      // Логируем в файл
      const logsDir = path.join(process.cwd(), "data", "logs", "recovery");
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }
      
      const logTimestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const logFile = path.join(logsDir, `${logTimestamp}-repair.log`);
      const logContent = [
        `Repair Plan Applied: ${plan.file || 'unknown'}`,
        `Previous Version: ${plan.previousVersion}`,
        `Generated At: ${plan.generatedAt}`,
        `Applied At: ${new Date().toISOString()}`,
        `Summary:`,
        `  Entities Restored: ${plan.summary.entitiesRestored}`,
        `  Fields Restored: ${plan.summary.fieldsRestored}`,
        `  Type Corrections: ${plan.summary.typeCorrections}`,
        `Total Operations: ${plan.operations.length}`
      ].join('\n');
      
      fs.writeFileSync(logFile, logContent, 'utf-8');
      logger.logInfo(`Лог сохранён: ${logFile}`);
      
      logger.logSuccess(`План восстановления применён успешно`);
      logger.logInfo(`Recovery state обновлён`);
    } else {
      logger.logInfo(`[DRY RUN] План будет применён (${plan.operations.length} операций)`);
      logger.logInfo(`[DRY RUN] Recovery state будет обновлён`);
    }
    
    return {
      success: true,
      plan: plan,
      backupPath: backupPath,
      dryRun: dryRun
    };
    
  } catch (error) {
    logger.logError(`Ошибка применения плана: ${error.message}`);
    throw error;
  }
}


