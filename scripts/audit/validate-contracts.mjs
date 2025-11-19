import Ajv from "ajv";
import addFormats from "ajv-formats";
// Утилиты IWDC v0.6
import * as paths from "../../utils/paths.mjs";
import { loadJsonFiles, readJsonFile } from "../../utils/file.mjs";

// Загрузка схем (используем утилиты из utils)
const seriesSchema = readJsonFile(paths.getSchemasPath("series"));
const modelSchema = readJsonFile(paths.getSchemasPath("model"));
const lengthSchema = readJsonFile(paths.getSchemasPath("length"));
const seoSchema = readJsonFile(paths.getSchemasPath("seo"));
const metaSchema = readJsonFile(paths.getSchemasPath("meta"));

// Инициализация Ajv
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

// Создание валидаторов
const validateSeries = ajv.compile(seriesSchema);
const validateModel = ajv.compile(modelSchema);
const validateLength = ajv.compile(lengthSchema);
const validateSEO = ajv.compile(seoSchema);
const validateMeta = ajv.compile(metaSchema);

// Функция loadJsonFiles теперь импортируется из utils/file.mjs

export async function run(options = {}) {
  const errors = [];
  const warnings = [];
  const stats = {
    series: { total: 0, valid: 0, invalid: 0 },
    models: { total: 0, valid: 0, invalid: 0 },
    lengths: { total: 0, valid: 0, invalid: 0 },
    seo: { total: 0, valid: 0, invalid: 0 },
    meta: { total: 0, valid: 0, invalid: 0 }
  };
  
  // Валидация Series (используем пути из utils)
  const seriesFiles = loadJsonFiles(paths.getDataJsonPath("series"));
  for (const { file, data, parseError } of seriesFiles) {
    if (parseError) {
      errors.push({
        file: file,
        message: `JSON parse error: ${parseError}`,
        field: null
      });
      stats.series.invalid++;
      continue;
    }
    
    stats.series.total++;
    
    // Если data - массив, валидируем каждый элемент
    if (Array.isArray(data)) {
      for (let i = 0; i < data.length; i++) {
        const valid = validateSeries(data[i]);
        if (!valid) {
          stats.series.invalid++;
          for (const error of validateSeries.errors || []) {
            errors.push({
              file: file,
              message: error.message,
              field: error.instancePath || `[${i}]`
            });
          }
        } else {
          stats.series.valid++;
        }
      }
    } else {
      // Одиночный объект
      const valid = validateSeries(data);
      if (!valid) {
        stats.series.invalid++;
        for (const error of validateSeries.errors || []) {
          errors.push({
            file: file,
            message: error.message,
            field: error.instancePath || '/'
          });
        }
      } else {
        stats.series.valid++;
      }
    }
  }
  
  // Валидация Models (используем пути из utils)
  const modelFiles = loadJsonFiles(paths.getDataJsonPath("models"));
  for (const { file, data, parseError } of modelFiles) {
    if (parseError) {
      errors.push({
        file: file,
        message: `JSON parse error: ${parseError}`,
        field: null
      });
      stats.models.invalid++;
      continue;
    }
    
    stats.models.total++;
    
    if (Array.isArray(data)) {
      for (let i = 0; i < data.length; i++) {
        const valid = validateModel(data[i]);
        if (!valid) {
          stats.models.invalid++;
          for (const error of validateModel.errors || []) {
            errors.push({
              file: file,
              message: error.message,
              field: error.instancePath || `[${i}]`
            });
          }
        } else {
          stats.models.valid++;
        }
      }
    } else {
      const valid = validateModel(data);
      if (!valid) {
        stats.models.invalid++;
        for (const error of validateModel.errors || []) {
          errors.push({
            file: file,
            message: error.message,
            field: error.instancePath || '/'
          });
        }
      } else {
        stats.models.valid++;
      }
    }
  }
  
  // Валидация Lengths (используем пути из utils)
  const lengthFiles = loadJsonFiles(paths.getDataJsonPath("lengths"));
  for (const { file, data, parseError } of lengthFiles) {
    if (parseError) {
      errors.push({
        file: file,
        message: `JSON parse error: ${parseError}`,
        field: null
      });
      stats.lengths.invalid++;
      continue;
    }
    
    stats.lengths.total++;
    
    if (Array.isArray(data)) {
      for (let i = 0; i < data.length; i++) {
        const valid = validateLength(data[i]);
        if (!valid) {
          stats.lengths.invalid++;
          for (const error of validateLength.errors || []) {
            errors.push({
              file: file,
              message: error.message,
              field: error.instancePath || `[${i}]`
            });
          }
        } else {
          stats.lengths.valid++;
        }
      }
    } else {
      const valid = validateLength(data);
      if (!valid) {
        stats.lengths.invalid++;
        for (const error of validateLength.errors || []) {
          errors.push({
            file: file,
            message: error.message,
            field: error.instancePath || '/'
          });
        }
      } else {
        stats.lengths.valid++;
      }
    }
  }
  
  // Валидация SEO (используем пути из utils)
  const seoFiles = loadJsonFiles(paths.getDataJsonPath("seo"));
  for (const { file, data, parseError } of seoFiles) {
    if (parseError) {
      errors.push({
        file: file,
        message: `JSON parse error: ${parseError}`,
        field: null
      });
      stats.seo.invalid++;
      continue;
    }
    
    stats.seo.total++;
    
    if (Array.isArray(data)) {
      for (let i = 0; i < data.length; i++) {
        const valid = validateSEO(data[i]);
        if (!valid) {
          stats.seo.invalid++;
          for (const error of validateSEO.errors || []) {
            errors.push({
              file: file,
              message: error.message,
              field: error.instancePath || `[${i}]`
            });
          }
        } else {
          stats.seo.valid++;
        }
      }
    } else {
      const valid = validateSEO(data);
      if (!valid) {
        stats.seo.invalid++;
        for (const error of validateSEO.errors || []) {
          errors.push({
            file: file,
            message: error.message,
            field: error.instancePath || '/'
          });
        }
      } else {
        stats.seo.valid++;
      }
    }
  }
  
  // Валидация Meta (используем пути из utils)
  const metaFiles = loadJsonFiles(paths.getDataJsonPath("meta"));
  for (const { file, data, parseError } of metaFiles) {
    if (parseError) {
      errors.push({
        file: file,
        message: `JSON parse error: ${parseError}`,
        field: null
      });
      stats.meta.invalid++;
      continue;
    }
    
    stats.meta.total++;
    
    // Meta обычно один объект, но проверим массив тоже
    if (Array.isArray(data)) {
      for (let i = 0; i < data.length; i++) {
        const valid = validateMeta(data[i]);
        if (!valid) {
          stats.meta.invalid++;
          for (const error of validateMeta.errors || []) {
            errors.push({
              file: file,
              message: error.message,
              field: error.instancePath || `[${i}]`
            });
          }
        } else {
          stats.meta.valid++;
        }
      }
    } else {
      const valid = validateMeta(data);
      if (!valid) {
        stats.meta.invalid++;
        for (const error of validateMeta.errors || []) {
          errors.push({
            file: file,
            message: error.message,
            field: error.instancePath || '/'
          });
        }
      } else {
        stats.meta.valid++;
      }
    }
  }
  
  return {
    scope: "validate-contracts",
    status: errors.length > 0 ? "error" : "ok",
    errors: errors,
    warnings: warnings,
    stats: stats
  };
}
