import { readFile, writeFile, mkdir } from 'fs/promises';
import fs from 'fs/promises';
import path from 'path';
import * as XLSX from 'xlsx';

/**
 * Утилита для чтения JSON файла
 */
async function readJson(filePath) {
  const content = await readFile(filePath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Преобразует букву колонки Excel (A, B, ..., Z, AA, AB, ...) в индекс (0, 1, 2, ...)
 */
function columnLetterToIndex(letter) {
  let index = 0;
  for (let i = 0; i < letter.length; i++) {
    index = index * 26 + (letter.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
  }
  return index - 1;
}

/**
 * Загружает XLS/XLSX файл и возвращает workbook
 */
async function loadXls(filePath) {
  const buffer = await fs.readFile(filePath);
  const workbook = XLSX.read(buffer, {
    type: 'buffer',
    cellDates: false
  });
  return workbook;
}

/**
 * Парсит артикул по шаблону ВК.<height>.<width>.<length>.<raw>
 * Где raw содержит трубность + букву исполнения (например: "2ТГ", "8ТП", "10ТВ")
 * Возвращает объект с извлеченными полями
 */
function parseArticle(articleFull) {
  if (!articleFull || typeof articleFull !== 'string') {
    throw new Error(`Артикул должен быть непустой строкой, получено: ${articleFull}`);
  }

  // Формат: ВК.<height>.<width>.<length>.<raw>
  // Примеры: ВК.55.160.600.2ТГ, ВК.150.300.2950.8ТП
  const pattern = /^ВК\.(\d+)\.(\d+)\.(\d+)\.(.+)$/;
  const match = articleFull.match(pattern);

  if (!match) {
    throw new Error(`Неверный формат артикула: "${articleFull}". Ожидается формат: ВК.<height>.<width>.<length>.<raw>`);
  }

  const series = 'ВК';
  const height = parseInt(match[1], 10);
  const width = parseInt(match[2], 10);
  const length = parseInt(match[3], 10);
  const raw = match[4];

  if (!raw || raw.trim() === '') {
    throw new Error(`Отсутствует raw часть в артикуле: "${articleFull}"`);
  }

  // Извлекаем tubes (все цифры в начале raw)
  const tubesMatch = raw.match(/^(\d+)/);
  if (!tubesMatch) {
    throw new Error(`Не найдены цифры трубности в raw части артикула: "${articleFull}" (raw: "${raw}")`);
  }
  const tubes = parseInt(tubesMatch[1], 10);

  // Извлекаем type (последняя буква кириллицы)
  const typeMatch = raw.match(/([А-ЯЁ])$/);
  if (!typeMatch) {
    throw new Error(`Не найдена буква исполнения (последняя кириллическая буква) в raw части артикула: "${articleFull}" (raw: "${raw}")`);
  }
  const type = typeMatch[1];

  // Формируем article_base: ВК.<height>.<width>.<tubes><type>
  const articleBase = `${series}.${height}.${width}.${tubes}${type}`;

  return {
    series,
    height,
    width,
    length,
    tubes,
    type,
    article_base: articleBase,
    article_full: articleFull
  };
}

/**
 * Парсит лист Excel согласно конфигурации
 * Применяет фильтры и извлекает данные
 */
function parseSheet(workbook, sheetConfig) {
  const sheetName = sheetConfig.sheetName;
  const sheet = workbook.Sheets[sheetName];

  if (!sheet) {
    console.warn(`⚠️  Лист "${sheetName}" не найден в книге`);
    return [];
  }

  // Конвертируем лист в JSON для удобной обработки
  const rows = XLSX.utils.sheet_to_json(sheet, { 
    header: 1, 
    defval: null,
    raw: false 
  });

  const results = [];
  const filters = sheetConfig.filters || {};

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    
    // Получаем значение article_full из колонки U
    const articleFullCol = sheetConfig.columns.article_full;
    const articleFullIndex = columnLetterToIndex(articleFullCol);
    const articleFull = row[articleFullIndex];

    // Применяем фильтр skipIfEmpty для article_full
    if (filters.skipIfEmpty && filters.skipIfEmpty.includes('U')) {
      if (!articleFull || articleFull.toString().trim() === '') {
        continue;
      }
    }

    // Применяем фильтр skipIfStartsWith
    if (filters.skipIfStartsWith && articleFull) {
      const articleStr = articleFull.toString().trim();
      const shouldSkip = filters.skipIfStartsWith.some(prefix => 
        articleStr.startsWith(prefix)
      );
      if (shouldSkip) {
        continue;
      }
    }

    // Извлекаем значения по колонкам
    const rowData = {};
    for (const [field, col] of Object.entries(sheetConfig.columns)) {
      const colIndex = columnLetterToIndex(col);
      rowData[field] = row[colIndex] || null;
    }

    // Добавляем метаданные из конфигурации листа
    rowData._sheetName = sheetName;
    rowData._height = sheetConfig.height;

    results.push(rowData);
  }

  return results;
}

/**
 * Экранирует значение для CSV
 * Обрабатывает кавычки, запятые и переносы строк
 */
function escapeCsvValue(value) {
  if (value === null || value === undefined) {
    return '';
  }
  
  const str = String(value);
  
  // Если содержит кавычки, запятые, точку с запятой или переносы строк - экранируем
  if (str.includes('"') || str.includes(',') || str.includes(';') || str.includes('\n') || str.includes('\r')) {
    // Удваиваем кавычки и оборачиваем в кавычки
    return `"${str.replace(/"/g, '""')}"`;
  }
  
  return str;
}

/**
 * Записывает CSV файл
 * @param {string} filePath - путь к файлу
 * @param {Array} rows - массив объектов
 * @param {Array} headerArray - массив названий колонок
 */
async function writeCsv(filePath, rows, headerArray) {
  // Создаём директорию, если её нет
  const dir = path.dirname(filePath);
  await mkdir(dir, { recursive: true });
  
  // Формируем заголовок
  const header = headerArray.map(escapeCsvValue).join(';');
  
  // Формируем строки данных
  const csvRows = rows.map(row => {
    return headerArray.map(col => {
      const value = row[col] !== null && row[col] !== undefined ? row[col] : '';
      return escapeCsvValue(value);
    }).join(';');
  });
  
  // Объединяем заголовок и строки
  const csvContent = [header, ...csvRows].join('\n');
  
  // Записываем файл в UTF-8
  await writeFile(filePath, csvContent, 'utf-8');
}

/**
 * Генерирует models.csv
 * @param {Set} modelsTemp - множество article_base
 * @param {string} series - серия (например, "VK")
 */
async function generateModelsCsv(modelsTemp, series) {
  // Преобразуем Set в массив объектов
  const models = Array.from(modelsTemp).map(articleBase => {
    // Парсим article_base: ВК.<height>.<width>.<tubes><type>
    // Пример: ВК.55.160.2Г (type - одна кириллическая буква)
    const pattern = /^ВК\.(\d+)\.(\d+)\.(\d+)([А-ЯЁ])$/;
    const match = articleBase.match(pattern);
    
    if (!match) {
      console.warn(`⚠️  Не удалось распарсить article_base: ${articleBase}`);
      return null;
    }
    
    return {
      series: series,
      height: parseInt(match[1], 10),
      width: parseInt(match[2], 10),
      tubes: parseInt(match[3], 10),
      type: match[4],
      article_base: articleBase,
      article_full: articleBase // В models.csv article_full = article_base (без длины)
    };
  }).filter(model => model !== null);
  
  // Сортируем по article_base
  models.sort((a, b) => a.article_base.localeCompare(b.article_base));
  
  // Заголовки для models.csv
  const header = ['series', 'height', 'width', 'tubes', 'type', 'article_base', 'article_full'];
  
  // Путь к файлу
  const filePath = path.join(process.cwd(), 'intermediate', 'csv', 'models.csv');
  
  // Записываем CSV
  await writeCsv(filePath, models, header);
  
  return {
    filePath,
    count: models.length
  };
}

/**
 * Генерирует lengths.csv
 * @param {Array} lengthsTemp - массив объектов длин
 */
async function generateLengthsCsv(lengthsTemp) {
  // Сортируем: сначала по article_base, затем по length
  const sorted = [...lengthsTemp].sort((a, b) => {
    // Сначала сравниваем по article_base
    const baseCompare = a.article_base.localeCompare(b.article_base);
    if (baseCompare !== 0) {
      return baseCompare;
    }
    // Если article_base одинаковый, сравниваем по length
    return a.length - b.length;
  });
  
  // Заголовки для lengths.csv
  const header = [
    'article_full',
    'article_base',
    'height',
    'width',
    'length',
    'tubes',
    'type',
    'weight',
    'heat_output',
    'price_o',
    'price_p',
    'price_q',
    'price_r',
    'price_s'
  ];
  
  // Формируем строки для CSV (используем length из артикула, а не length_mm)
  const rows = sorted.map(item => ({
    article_full: item.article_full,
    article_base: item.article_base,
    height: item.height,
    width: item.width,
    length: item.length, // длина из артикула
    tubes: item.tubes,
    type: item.type,
    weight: item.weight,
    heat_output: item.heat_output,
    price_o: item.price_o,
    price_p: item.price_p,
    price_q: item.price_q,
    price_r: item.price_r,
    price_s: item.price_s
  }));
  
  // Путь к файлу
  const filePath = path.join(process.cwd(), 'intermediate', 'csv', 'lengths.csv');
  
  // Записываем CSV
  await writeCsv(filePath, rows, header);
  
  return {
    filePath,
    count: rows.length
  };
}

/**
 * Основная функция скрипта
 */
async function main() {
  // Получаем путь к XLS файлу из аргументов командной строки
  const xlsFilePath = process.argv[2];

  if (!xlsFilePath) {
    console.error('❌ Ошибка: не указан путь к XLS файлу');
    console.error('Использование: node scripts/xls-to-csv.mjs <путь-к-xls-файлу>');
    process.exit(1);
  }

  try {
    // Загружаем конфигурацию маппинга
    const mappingPath = path.join(process.cwd(), 'sources', 'xls', 'mapping.json');
    const mapping = await readJson(mappingPath);

    console.log(`📖 Загружена конфигурация для серии: ${mapping.series}`);
    console.log(`📊 Количество листов в конфигурации: ${mapping.sheets.length}`);

    // Загружаем XLS файл
    console.log(`\n📂 Загрузка файла: ${xlsFilePath}`);
    const workbook = await loadXls(xlsFilePath);
    console.log(`✅ Книга загружена. Листы: ${workbook.SheetNames.join(', ')}`);

    // Временные массивы для сбора данных
    const modelsTemp = new Set(); // Уникальные модели по article_base
    const lengthsTemp = []; // Массив длин с ценами и параметрами
    const processedSheets = []; // Список обработанных листов

    // Обрабатываем каждый лист из конфигурации
    for (const sheetConfig of mapping.sheets) {
      console.log(`\n🔍 Обработка листа: ${sheetConfig.sheetName} (высота: ${sheetConfig.height})`);
      
      const rows = parseSheet(workbook, sheetConfig);
      
      if (rows.length === 0) {
        console.log(`   ⚠️  Лист "${sheetConfig.sheetName}" не содержит данных после фильтрации`);
        continue;
      }

      processedSheets.push(sheetConfig.sheetName);

      // Обрабатываем каждую строку
      for (const row of rows) {
        const articleFull = row.article_full;

        if (!articleFull) {
          continue;
        }

        // Парсим артикул
        let articleParts;
        try {
          articleParts = parseArticle(articleFull);
        } catch (error) {
          console.warn(`   ⚠️  ${error.message}`);
          continue;
        }

        // Используем article_base из результата парсинга
        const articleBase = articleParts.article_base;
        modelsTemp.add(articleBase);

        // Собираем данные о длине
        const lengthData = {
          article_base: articleBase,
          article_full: articleParts.article_full,
          height: articleParts.height,
          width: articleParts.width,
          length: articleParts.length,
          tubes: articleParts.tubes,
          type: articleParts.type,
          length_mm: row.length !== null && row.length !== undefined ? parseFloat(row.length) : null,
          weight: row.weight !== null && row.weight !== undefined ? parseFloat(row.weight) : null,
          heat_output: row.heat_output !== null && row.heat_output !== undefined ? parseFloat(row.heat_output) : null,
          price_o: row.price_o !== null && row.price_o !== undefined ? parseFloat(row.price_o) : null,
          price_p: row.price_p !== null && row.price_p !== undefined ? parseFloat(row.price_p) : null,
          price_q: row.price_q !== null && row.price_q !== undefined ? parseFloat(row.price_q) : null,
          price_r: row.price_r !== null && row.price_r !== undefined ? parseFloat(row.price_r) : null,
          price_s: row.price_s !== null && row.price_s !== undefined ? parseFloat(row.price_s) : null
        };

        lengthsTemp.push(lengthData);
      }

      console.log(`   ✅ Обработано строк: ${rows.length}`);
    }

    // Выводим статистику
    console.log('\n' + '='.repeat(60));
    console.log('📈 СТАТИСТИКА ОБРАБОТКИ');
    console.log('='.repeat(60));
    console.log(`Количество моделей (уникальных): ${modelsTemp.size}`);
    console.log(`Количество длин: ${lengthsTemp.length}`);
    console.log(`Обработанные листы: ${processedSheets.join(', ')}`);
    console.log('='.repeat(60));

    // Генерируем CSV файлы
    console.log('\n📝 Генерация CSV файлов...');
    
    const modelsResult = await generateModelsCsv(modelsTemp, mapping.series);
    console.log(`✅ models.csv создан: ${modelsResult.filePath}`);
    console.log(`   Количество строк: ${modelsResult.count}`);
    
    const lengthsResult = await generateLengthsCsv(lengthsTemp);
    console.log(`✅ lengths.csv создан: ${lengthsResult.filePath}`);
    console.log(`   Количество строк: ${lengthsResult.count}`);
    
    console.log('\n✨ Обработка завершена успешно!');

  } catch (error) {
    console.error('❌ Ошибка при выполнении скрипта:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Запускаем скрипт
main();

