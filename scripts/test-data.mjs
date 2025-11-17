import fs from "fs";
import path from "path";
import Ajv from "ajv";
import addFormats from "ajv-formats";

/**
 * Получает все JSON файлы из директории
 */
function getJsonFiles(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) {
      return [];
    }
    const files = fs.readdirSync(dirPath);
    return files
      .filter(file => file.endsWith('.json'))
      .map(file => path.join(dirPath, file));
  } catch (error) {
    return [];
  }
}

/**
 * Загружает JSON файл
 */
function loadJson(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Проверяет уникальность slug
 */
function checkSlugUniqueness(items, type) {
  const slugs = new Map();
  const duplicates = [];
  
  for (const item of items) {
    const slug = item.slug;
    if (slugs.has(slug)) {
      duplicates.push({
        slug: slug,
        files: [slugs.get(slug), item._filePath]
      });
    } else {
      slugs.set(slug, item._filePath);
    }
  }
  
  return duplicates;
}

/**
 * Проверяет корректность значения length
 */
function checkLengthValue(lengthObj) {
  const length = lengthObj.length;
  
  if (typeof length !== 'number') {
    return { valid: false, error: `Длина должна быть числом, получено: ${typeof length}` };
  }
  
  if (!Number.isInteger(length)) {
    return { valid: false, error: `Длина должна быть целым числом, получено: ${length}` };
  }
  
  if (length <= 0) {
    return { valid: false, error: `Длина должна быть больше 0, получено: ${length}` };
  }
  
  return { valid: true };
}

/**
 * Проверяет отсутствующие длины у моделей
 */
function checkMissingLengths(models, lengthsMap) {
  const missing = [];
  
  for (const model of models) {
    if (!model.lengths || !Array.isArray(model.lengths)) {
      continue;
    }
    
    for (const lengthSlug of model.lengths) {
      if (!lengthsMap.has(lengthSlug)) {
        missing.push({
          model: model.slug,
          modelCode: model.model_code,
          missingLengthSlug: lengthSlug,
          filePath: model._filePath
        });
      }
    }
  }
  
  return missing;
}

export async function testData() {
  const ajv = new Ajv({ allErrors: true });
  addFormats(ajv);

  const modelSchema = JSON.parse(fs.readFileSync("schemas/model.schema.json", "utf8"));
  const lengthSchema = JSON.parse(fs.readFileSync("schemas/length.schema.json", "utf8"));

  const validateModel = ajv.compile(modelSchema);
  const validateLength = ajv.compile(lengthSchema);

  console.log('📖 Схемы загружены');

  // Получаем пути к директориям
  const modelsDir = path.join(process.cwd(), 'data', 'json', 'models');
  const lengthsDir = path.join(process.cwd(), 'data', 'json', 'lengths');

  console.log('\n🔍 Сканирование файлов...');
  const modelFiles = getJsonFiles(modelsDir);
  const lengthFiles = getJsonFiles(lengthsDir);

  console.log(`   Найдено файлов models: ${modelFiles.length}`);
  console.log(`   Найдено файлов lengths: ${lengthFiles.length}`);

  // Загружаем и валидируем модели
  console.log('\n📋 Валидация models по схеме...');
  const models = [];
  let modelSchemaErrors = 0;

  for (const filePath of modelFiles) {
    try {
      const data = loadJson(filePath);
      data._filePath = filePath;

      const valid = validateModel(data);

      if (valid) {
        models.push(data);
      } else {
        modelSchemaErrors++;
        console.error(`   ❌ ${path.basename(filePath)}`);
        validateModel.errors.forEach(err => {
          console.error(`      - ${err.instancePath || '/'}: ${err.message}`);
        });
      }
    } catch (error) {
      modelSchemaErrors++;
      console.error(`   ❌ ${path.basename(filePath)}: ${error.message}`);
    }
  }

  console.log(`   ✅ Валидно: ${models.length}, ❌ Ошибок: ${modelSchemaErrors}`);

  // Загружаем и валидируем длины
  console.log('\n📏 Валидация lengths по схеме...');
  const lengths = [];
  const lengthsMap = new Map(); // slug -> length object
  let lengthSchemaErrors = 0;

  for (const filePath of lengthFiles) {
    try {
      const data = loadJson(filePath);
      data._filePath = filePath;

      const valid = validateLength(data);

      if (valid) {
        lengths.push(data);
        lengthsMap.set(data.slug, data);
      } else {
        lengthSchemaErrors++;
        console.error(`   ❌ ${path.basename(filePath)}`);
        validateLength.errors.forEach(err => {
          console.error(`      - ${err.instancePath || '/'}: ${err.message}`);
        });
      }
    } catch (error) {
      lengthSchemaErrors++;
      console.error(`   ❌ ${path.basename(filePath)}: ${error.message}`);
    }
  }

  console.log(`   ✅ Валидно: ${lengths.length}, ❌ Ошибок: ${lengthSchemaErrors}`);

  // Проверяем уникальность slug для моделей
  console.log('\n🔍 Проверка уникальности slug (models)...');
  const modelSlugDuplicates = checkSlugUniqueness(models, 'model');
  if (modelSlugDuplicates.length > 0) {
    modelSlugDuplicates.forEach(dup => {
      console.error(`   ❌ Дубликат slug "${dup.slug}":`);
      dup.files.forEach(file => {
        console.error(`      - ${path.basename(file)}`);
      });
    });
  } else {
    console.log('   ✅ Все slug моделей уникальны');
  }

  // Проверяем уникальность slug для длин
  console.log('\n🔍 Проверка уникальности slug (lengths)...');
  const lengthSlugDuplicates = checkSlugUniqueness(lengths, 'length');
  if (lengthSlugDuplicates.length > 0) {
    lengthSlugDuplicates.forEach(dup => {
      console.error(`   ❌ Дубликат slug "${dup.slug}":`);
      dup.files.forEach(file => {
        console.error(`      - ${path.basename(file)}`);
      });
    });
  } else {
    console.log('   ✅ Все slug длин уникальны');
  }

  // Проверяем корректность длины
  console.log('\n🔍 Проверка корректности значений length...');
  let lengthValueErrors = 0;
  for (const lengthObj of lengths) {
    const check = checkLengthValue(lengthObj);
    if (!check.valid) {
      lengthValueErrors++;
      console.error(`   ❌ ${path.basename(lengthObj._filePath)} (slug: ${lengthObj.slug}): ${check.error}`);
    }
  }

  if (lengthValueErrors === 0) {
    console.log('   ✅ Все значения length корректны');
  }

  // Проверяем отсутствующие длины у моделей
  console.log('\n🔍 Проверка отсутствующих длин у моделей...');
  const missingLengths = checkMissingLengths(models, lengthsMap);
  if (missingLengths.length > 0) {
    missingLengths.forEach(missing => {
      console.error(`   ❌ Модель "${missing.model}" (${missing.modelCode}) ссылается на отсутствующую длину "${missing.missingLengthSlug}"`);
      console.error(`      Файл: ${path.basename(missing.filePath)}`);
    });
  } else {
    console.log('   ✅ Все ссылки на длины корректны');
  }

  // Итоговая статистика
  const totalErrors = modelSchemaErrors + lengthSchemaErrors + 
                      modelSlugDuplicates.length + lengthSlugDuplicates.length + 
                      lengthValueErrors + missingLengths.length;

  console.log('\n' + '='.repeat(60));
  console.log('📊 ИТОГИ ТЕСТИРОВАНИЯ');
  console.log('='.repeat(60));
  console.log(`Models: ${models.length} валидных, ${modelSchemaErrors} ошибок схемы`);
  console.log(`Lengths: ${lengths.length} валидных, ${lengthSchemaErrors} ошибок схемы`);
  console.log(`Дубликаты slug (models): ${modelSlugDuplicates.length}`);
  console.log(`Дубликаты slug (lengths): ${lengthSlugDuplicates.length}`);
  console.log(`Ошибки значений length: ${lengthValueErrors}`);
  console.log(`Отсутствующие длины: ${missingLengths.length}`);
  console.log(`Всего ошибок: ${totalErrors}`);
  console.log('='.repeat(60));

  // Возвращаем результат
  return {
    models: {
      total: modelFiles.length,
      valid: models.length,
      errors: modelSchemaErrors
    },
    lengths: {
      total: lengthFiles.length,
      valid: lengths.length,
      errors: lengthSchemaErrors
    },
    duplicates: {
      models: modelSlugDuplicates.length,
      lengths: lengthSlugDuplicates.length
    },
    lengthValueErrors: lengthValueErrors,
    missingLengths: missingLengths.length,
    totalErrors: totalErrors
  };
}

export default testData;
