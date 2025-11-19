import fs from "fs";
import crypto from "crypto";
import * as config from "./integrity-config.mjs";

/**
 * Утилиты хеширования для Security Storage Layer IWDC v0.95
 * 
 * Функции для вычисления SHA256 хешей файлов и построения дерева хешей
 */

/**
 * Вычисляет хеш файла
 * @param {string} filePath - путь к файлу
 * @returns {object} { hash: string, size: number }
 */
export function hashFile(filePath) {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const hash = crypto.createHash(config.HASH_ALGORITHM);
    hash.update(fileBuffer);
    const hashHex = hash.digest('hex');
    const size = fs.statSync(filePath).size;
    
    return {
      hash: hashHex,
      size: size
    };
  } catch (error) {
    throw new Error(`Ошибка хеширования файла ${filePath}: ${error.message}`);
  }
}

/**
 * Строит корневой хеш дерева файлов
 * 
 * Алгоритм:
 * 1. Сортирует файлы по пути
 * 2. Для каждого файла создаёт строку "path:hash"
 * 3. Конкатенирует все строки
 * 4. Хеширует результат
 * 
 * @param {Array} fileEntries - массив объектов { path, hash }
 * @returns {string} Корневой хеш дерева
 */
export function hashTree(fileEntries) {
  if (fileEntries.length === 0) {
    // Пустое дерево - возвращаем хеш пустой строки
    return crypto.createHash(config.HASH_ALGORITHM).update('').digest('hex');
  }
  
  // Сортируем по пути для детерминированности
  const sorted = [...fileEntries].sort((a, b) => {
    const pathA = a.path.replace(/\\/g, '/');
    const pathB = b.path.replace(/\\/g, '/');
    return pathA.localeCompare(pathB);
  });
  
  // Формируем строку для хеширования
  const treeString = sorted
    .map(entry => `${entry.path.replace(/\\/g, '/')}:${entry.hash}`)
    .join('\n');
  
  // Вычисляем хеш
  const hash = crypto.createHash(config.HASH_ALGORITHM);
  hash.update(treeString);
  
  return hash.digest('hex');
}

/**
 * Экспорт для использования в других модулях
 */
export default {
  hashFile,
  hashTree
};


