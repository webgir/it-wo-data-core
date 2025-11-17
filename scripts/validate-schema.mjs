import { readFile, readdir } from 'fs/promises';
import path from 'path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

/**
 * Загружает JSON файл
 */
async function loadJson(filePath) {
  const content = await readFile(filePath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Получает все JSON файлы из директории
 */
async function getJsonFiles(dirPath) {
  try {
    const files = await readdir(dirPath);
    return files
      .filter(file => file.endsWith('.json'))
      .map(file => path.join(dirPath, file));
  } catch (error) {
    // Если директория не существует или пуста, возвращаем пустой массив
    return [];
  }
}

/**
 * Валидирует JSON файл по схеме
 */
function validateFile(validator, filePath, data) {
  const valid = validator(data);
  
  if (!valid) {
    return {
      valid: false,
      errors: validator.errors
    };
  }
  
  return {
    valid: true,
    errors: null
  };
}

/**
 * Основная функция валидации
 */
async function main() {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);

  // Загружаем схемы
  const modelSchemaPath = path.join(process.cwd(), 'schemas', 'model.schema.json');
  const lengthSchemaPath = path.join(process.cwd(), 'schemas', 'length.schema.json');

  console.log('📖 Загрузка схем...');
  
  let modelSchema, lengthSchema;
  try {
    modelSchema = await loadJson(modelSchemaPath);
    lengthSchema = await loadJson(lengthSchemaPath);
    console.log('✅ Схемы загружены');
  } catch (error) {
    console.error(`❌ Ошибка загрузки схем: ${error.message}`);
    process.exit(1);
  }

  // Компилируем валидаторы
  const modelValidator = ajv.compile(modelSchema);
  const lengthValidator = ajv.compile(lengthSchema);

  // Получаем пути к директориям
  const modelsDir = path.join(process.cwd(), 'data', 'json', 'models');
  const lengthsDir = path.join(process.cwd(), 'data', 'json', 'lengths');

  console.log('\n🔍 Сканирование файлов...');
  
  const modelFiles = await getJsonFiles(modelsDir);
  const lengthFiles = await getJsonFiles(lengthsDir);

  console.log(`   Найдено файлов models: ${modelFiles.length}`);
  console.log(`   Найдено файлов lengths: ${lengthFiles.length}`);

  // Валидируем модели
  console.log('\n📋 Валидация models...');
  let modelErrors = 0;
  let modelSuccess = 0;

  for (const filePath of modelFiles) {
    try {
      const data = await loadJson(filePath);
      const result = validateFile(modelValidator, filePath, data);
      
      if (result.valid) {
        modelSuccess++;
        console.log(`   ✅ ${path.basename(filePath)}`);
      } else {
        modelErrors++;
        console.error(`   ❌ ${path.basename(filePath)}`);
        result.errors.forEach(error => {
          console.error(`      - ${error.instancePath || '/'}: ${error.message}`);
        });
      }
    } catch (error) {
      modelErrors++;
      console.error(`   ❌ ${path.basename(filePath)}: ${error.message}`);
    }
  }

  // Валидируем длины
  console.log('\n📏 Валидация lengths...');
  let lengthErrors = 0;
  let lengthSuccess = 0;

  for (const filePath of lengthFiles) {
    try {
      const data = await loadJson(filePath);
      const result = validateFile(lengthValidator, filePath, data);
      
      if (result.valid) {
        lengthSuccess++;
        console.log(`   ✅ ${path.basename(filePath)}`);
      } else {
        lengthErrors++;
        console.error(`   ❌ ${path.basename(filePath)}`);
        result.errors.forEach(error => {
          console.error(`      - ${error.instancePath || '/'}: ${error.message}`);
        });
      }
    } catch (error) {
      lengthErrors++;
      console.error(`   ❌ ${path.basename(filePath)}: ${error.message}`);
    }
  }

  // Итоговая статистика
  console.log('\n' + '='.repeat(60));
  console.log('📊 ИТОГИ ВАЛИДАЦИИ');
  console.log('='.repeat(60));
  console.log(`Models: ${modelSuccess} успешно, ${modelErrors} с ошибками`);
  console.log(`Lengths: ${lengthSuccess} успешно, ${lengthErrors} с ошибками`);
  console.log('='.repeat(60));

  // Возвращаем код выхода
  if (modelErrors > 0 || lengthErrors > 0) {
    console.error('\n❌ Валидация завершена с ошибками');
    process.exit(1);
  } else {
    console.log('\n✅ Все файлы прошли валидацию');
    process.exit(0);
  }
}

// Запускаем валидацию
main().catch(error => {
  console.error('❌ Критическая ошибка:', error.message);
  if (error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});

