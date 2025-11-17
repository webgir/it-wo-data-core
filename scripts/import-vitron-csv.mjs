import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import Ajv from "ajv";
import addFormats from "ajv-formats";

/**
 * Читает CSV файл и возвращает массив объектов
 */
function readCSV(file) {
  const content = fs.readFileSync(file, "utf-8");
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    delimiter: ";",
    trim: true
  });
  return records;
}

/**
 * Преобразует строку в slug (lowercase, транслитерация кириллицы)
 */
function toSlug(str) {
  return str.toLowerCase().replace(/[А-ЯЁ]/g, char => {
    const map = {
      'А': 'a', 'Б': 'b', 'В': 'v', 'Г': 'g', 'Д': 'd', 'Е': 'e', 'Ё': 'e',
      'Ж': 'zh', 'З': 'z', 'И': 'i', 'Й': 'y', 'К': 'k', 'Л': 'l', 'М': 'm',
      'Н': 'n', 'О': 'o', 'П': 'p', 'Р': 'r', 'С': 's', 'Т': 't', 'У': 'u',
      'Ф': 'f', 'Х': 'h', 'Ц': 'ts', 'Ч': 'ch', 'Ш': 'sh', 'Щ': 'sch',
      'Ъ': '', 'Ы': 'y', 'Ь': '', 'Э': 'e', 'Ю': 'yu', 'Я': 'ya'
    };
    return map[char] || char;
  });
}

/**
 * Генерирует slug из series и modelCode
 * Точки заменяются на дефисы, всё в lowercase
 * Если указан length, добавляется к slug
 */
function generateSlug(series, modelCode, length) {
  let combined = `${series}.${modelCode}`;
  if (length !== undefined && length !== null) {
    combined = `${combined}.${length}`;
  }
  return combined.toLowerCase().replace(/\./g, '-');
}

/**
 * Генерирует хеш для объекта
 */
function generateHash(obj) {
  const crypto = require('crypto');
  const str = JSON.stringify(obj);
  return crypto.createHash('sha256').update(str).digest('hex').substring(0, 16);
}

/**
 * Создает объект meta
 */
function createMeta(data) {
  const now = new Date().toISOString();
  const hash = generateHash(data);
  return {
    version: '0.1.0',
    updated: now,
    hash: hash
  };
}

/**
 * Строит JSON объект для модели из CSV строки
 */
function buildModelJSON(row) {
  const articleBase = row.article_base || row.article_full;
  const slug = toSlug(articleBase);
  const series = row.series || 'VK';
  
  const model = {
    series: series,
    model_code: articleBase,
    slug: slug,
    path: `/${series.toLowerCase()}/${slug}`,
    material: 'none',
    lengths: [],
    meta: createMeta(row)
  };
  
  return model;
}

/**
 * Строит JSON объект для длины из CSV строки
 */
function buildLengthJSON(row) {
  const articleFull = row.article_full;
  const articleBase = row.article_base;
  const slug = toSlug(articleFull);
  const series = row.series || 'VK';
  
  const length = parseInt(row.length, 10);
  const heatOutput = row.heat_output ? parseFloat(row.heat_output) : 0;
  
  // Преобразуем цены (используем price_o как side, price_p как bottom)
  const priceSide = row.price_o ? parseInt(row.price_o, 10) : (row.price_p ? parseInt(row.price_p, 10) : 0);
  const priceBottom = row.price_p ? parseInt(row.price_p, 10) : (row.price_o ? parseInt(row.price_o, 10) : 0);
  
  const lengthObj = {
    series: series,
    model_code: articleBase,
    length: length,
    slug: slug,
    path: `/${series.toLowerCase()}/${toSlug(articleBase)}/${length}`,
    thermal: {
      watt: Math.round(heatOutput)
    },
    price: {
      side: priceSide,
      bottom: priceBottom
    },
    meta: createMeta(row)
  };
  
  return lengthObj;
}

/**
 * Записывает JSON файл
 */
function writeJSON(file, data) {
  // Создаём директорию, если её нет
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  // Форматируем JSON с отступами
  const jsonContent = JSON.stringify(data, null, 2);
  
  // Записываем файл
  fs.writeFileSync(file, jsonContent, 'utf-8');
}

export async function importVitronCSV() {
  const ajv = new Ajv({ allErrors: true });
  addFormats(ajv);

  const modelSchema = JSON.parse(fs.readFileSync("schemas/model.schema.json", "utf8"));
  const lengthSchema = JSON.parse(fs.readFileSync("schemas/length.schema.json", "utf8"));

  const validateModel = ajv.compile(modelSchema);
  const validateLength = ajv.compile(lengthSchema);

  console.log('📖 Загрузка CSV файлов...');
  
  // Читаем CSV файлы
  const modelsCsvPath = path.join(process.cwd(), 'intermediate', 'csv', 'models.csv');
  const lengthsCsvPath = path.join(process.cwd(), 'intermediate', 'csv', 'lengths.csv');
  
  const modelsRows = readCSV(modelsCsvPath);
  const lengthsRows = readCSV(lengthsCsvPath);
  
  console.log(`   Загружено моделей: ${modelsRows.length}`);
  console.log(`   Загружено длин: ${lengthsRows.length}`);
  
  // Группируем длины по моделям
  const lengthsByModel = {};
  lengthsRows.forEach(row => {
    const modelCode = row.article_base;
    if (!lengthsByModel[modelCode]) {
      lengthsByModel[modelCode] = [];
    }
    lengthsByModel[modelCode].push(row);
  });
  
  // Обрабатываем модели
  console.log('\n🔨 Построение JSON для моделей...');
  const modelsOutput = [];
  let modelErrors = 0;
  
  for (const row of modelsRows) {
    try {
      const model = buildModelJSON(row);
      
      // Добавляем список длин для модели
      const modelLengths = lengthsByModel[model.model_code] || [];
      model.lengths = modelLengths.map(l => {
        const lengthSlug = toSlug(l.article_full);
        return lengthSlug;
      });
      
      // Валидируем
      const valid = validateModel(model);
      if (!valid) {
        modelErrors++;
        console.error(`   ❌ Ошибка валидации модели ${model.model_code}:`);
        validateModel.errors.forEach(err => {
          console.error(`      - ${err.instancePath || '/'}: ${err.message}`);
        });
        continue;
      }
      
      modelsOutput.push(model);
    } catch (error) {
      modelErrors++;
      console.error(`   ❌ Ошибка обработки модели ${row.article_base}: ${error.message}`);
    }
  }
  
  console.log(`   ✅ Обработано моделей: ${modelsOutput.length}`);
  if (modelErrors > 0) {
    console.log(`   ⚠️  Ошибок: ${modelErrors}`);
  }
  
  // Обрабатываем длины
  console.log('\n🔨 Построение JSON для длин...');
  const lengthsOutput = [];
  let lengthErrors = 0;
  
  for (const row of lengthsRows) {
    try {
      const lengthObj = buildLengthJSON(row);
      
      // Валидируем
      const valid = validateLength(lengthObj);
      if (!valid) {
        lengthErrors++;
        console.error(`   ❌ Ошибка валидации длины ${lengthObj.slug}:`);
        validateLength.errors.forEach(err => {
          console.error(`      - ${err.instancePath || '/'}: ${err.message}`);
        });
        continue;
      }
      
      lengthsOutput.push(lengthObj);
    } catch (error) {
      lengthErrors++;
      console.error(`   ❌ Ошибка обработки длины ${row.article_full}: ${error.message}`);
    }
  }
  
  console.log(`   ✅ Обработано длин: ${lengthsOutput.length}`);
  if (lengthErrors > 0) {
    console.log(`   ⚠️  Ошибок: ${lengthErrors}`);
  }
  
  // Записываем JSON файлы
  console.log('\n💾 Запись JSON файлов...');
  
  const modelsDir = path.join(process.cwd(), 'data', 'json', 'models');
  const lengthsDir = path.join(process.cwd(), 'data', 'json', 'lengths');
  
  // Записываем модели
  for (const model of modelsOutput) {
    const fileName = `${model.slug}.json`;
    const filePath = path.join(modelsDir, fileName);
    writeJSON(filePath, model);
  }
  
  // Записываем длины
  for (const lengthObj of lengthsOutput) {
    const fileName = `${lengthObj.slug}.json`;
    const filePath = path.join(lengthsDir, fileName);
    writeJSON(filePath, lengthObj);
  }
  
  console.log(`   ✅ Записано моделей: ${modelsOutput.length}`);
  console.log(`   ✅ Записано длин: ${lengthsOutput.length}`);
  
  console.log('\n✨ Импорт завершён успешно!');
  
  return {
    models: modelsOutput.length,
    lengths: lengthsOutput.length,
    errors: modelErrors + lengthErrors
  };
}

export default importVitronCSV;
