import fs from "fs";
import path from "path";
// Утилиты IWDC v0.6
import * as paths from "../../utils/paths.mjs";
import { readJsonFile, writeJsonFile } from "../../utils/file.mjs";
import * as logger from "../../utils/logger.mjs";

/**
 * Путь к файлу recovery state
 */
const RECOVERY_STATE_PATH = path.join(process.cwd(), "data", "state", "recovery-state.json");

/**
 * Дефолтное состояние recovery
 */
const DEFAULT_STATE = {
  lastSuccessfulVersion: null,
  lastBuild: null,
  currentDataOrigin: {
    source: "working",
    reference: null,
    timestamp: null
  }
};

/**
 * Загружает recovery state из файла
 * @returns {object} Объект состояния recovery
 */
export function loadRecoveryState() {
  try {
    if (!fs.existsSync(RECOVERY_STATE_PATH)) {
      logger.logInfo(`Recovery state не найден, используется дефолтное состояние`);
      return { ...DEFAULT_STATE };
    }
    
    const state = readJsonFile(RECOVERY_STATE_PATH);
    
    // Валидация структуры (базовая)
    if (!state || typeof state !== 'object') {
      logger.logWarning('Recovery state имеет некорректную структуру, используется дефолт');
      return { ...DEFAULT_STATE };
    }
    
    // Убеждаемся, что все обязательные поля присутствуют
    return {
      lastSuccessfulVersion: state.lastSuccessfulVersion ?? DEFAULT_STATE.lastSuccessfulVersion,
      lastBuild: state.lastBuild ?? DEFAULT_STATE.lastBuild,
      currentDataOrigin: {
        source: state.currentDataOrigin?.source ?? DEFAULT_STATE.currentDataOrigin.source,
        reference: state.currentDataOrigin?.reference ?? DEFAULT_STATE.currentDataOrigin.reference,
        timestamp: state.currentDataOrigin?.timestamp ?? DEFAULT_STATE.currentDataOrigin.timestamp
      }
    };
  } catch (error) {
    logger.logWarning(`Ошибка загрузки recovery state: ${error.message}, используется дефолт`);
    return { ...DEFAULT_STATE };
  }
}

/**
 * Сохраняет recovery state в файл
 * @param {object} state - объект состояния для сохранения
 */
export function saveRecoveryState(state) {
  try {
    // Создаём директорию, если её нет
    const stateDir = path.dirname(RECOVERY_STATE_PATH);
    if (!fs.existsSync(stateDir)) {
      fs.mkdirSync(stateDir, { recursive: true });
      logger.logInfo(`Создана директория: ${stateDir}`);
    }
    
    // Нормализуем state (убираем лишние поля, добавляем недостающие)
    const normalizedState = {
      lastSuccessfulVersion: state.lastSuccessfulVersion ?? null,
      lastBuild: state.lastBuild ?? null,
      currentDataOrigin: {
        source: state.currentDataOrigin?.source ?? "working",
        reference: state.currentDataOrigin?.reference ?? null,
        timestamp: state.currentDataOrigin?.timestamp ?? null
      }
    };
    
    // Сохраняем через утилиту
    writeJsonFile(RECOVERY_STATE_PATH, normalizedState);
    
    logger.logSuccess(`Recovery state сохранён: ${RECOVERY_STATE_PATH}`);
  } catch (error) {
    logger.logError(`Ошибка сохранения recovery state: ${error.message}`);
    throw error;
  }
}


