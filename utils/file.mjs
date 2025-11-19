import fs from "fs";
import path from "path";

/**
 * Утилиты для работы с файлами в IWDC
 */

/**
 * Загружает все JSON файлы из директории
 * @param {string} dir - путь к директории
 * @returns {Array<{file: string, data: any, parseError?: string}>}
 */
export function loadJsonFiles(dir) {
  const files = [];
  
  if (!fs.existsSync(dir)) {
    return files;
  }
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.json')) {
      const filePath = path.join(dir, entry.name);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content);
        files.push({
          file: filePath,
          data: data
        });
      } catch (error) {
        // Ошибка парсинга JSON - сохраняем для обработки
        files.push({
          file: filePath,
          data: null,
          parseError: error.message
        });
      }
    }
  }
  
  return files;
}

/**
 * Загружает все JSON файлы из директории и возвращает Map<id, data>
 * @param {string} dir - путь к директории
 * @returns {Map<string, any>}
 */
export function loadJsonMap(dir) {
  const map = new Map();
  
  if (!fs.existsSync(dir)) {
    return map;
  }
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.json')) {
      const filePath = path.join(dir, entry.name);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content);
        
        // Если data - массив, обрабатываем каждый элемент
        if (Array.isArray(data)) {
          for (const item of data) {
            const id = item.id;
            if (id) {
              map.set(id, item);
            }
          }
        } else {
          // Одиночный объект
          const id = data.id;
          if (id) {
            map.set(id, data);
          }
        }
      } catch (error) {
        // Пропускаем файлы с ошибками парсинга
      }
    }
  }
  
  return map;
}

/**
 * Извлекает все объекты из файлов (массивы или одиночные объекты)
 * @param {Array<{file: string, data: any, parseError?: string}>} files - массив файлов
 * @returns {Array<{file: string, item: any}>}
 */
export function extractObjects(files) {
  const objects = [];
  for (const { file, data, parseError } of files) {
    if (parseError || !data) {
      continue;
    }
    if (Array.isArray(data)) {
      for (const item of data) {
        objects.push({ file, item });
      }
    } else {
      objects.push({ file, item: data });
    }
  }
  return objects;
}

/**
 * Читает и парсит JSON файл
 * @param {string} filePath - путь к файлу
 * @returns {any} Распарсенные данные
 * @throws {Error} Если файл не существует или невалидный JSON
 */
export function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Записывает данные в JSON файл
 * @param {string} filePath - путь к файлу
 * @param {any} data - данные для записи
 * @param {number} indent - отступ для форматирования (по умолчанию 2)
 */
export function writeJsonFile(filePath, data, indent = 2) {
  const dir = path.dirname(filePath);
  
  // Создаём директорию, если её нет
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  const content = JSON.stringify(data, null, indent);
  fs.writeFileSync(filePath, content, 'utf-8');
}


