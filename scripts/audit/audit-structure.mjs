// Утилиты IWDC v0.6
import * as paths from "../../utils/paths.mjs";
import { loadJsonFiles, extractObjects } from "../../utils/file.mjs";

export async function run(options = {}) {
  const errors = [];
  const warnings = [];
  
  // Загрузка данных
  // Загружаем данные (используем пути из utils)
  const seriesFiles = loadJsonFiles(paths.getDataJsonPath("series"));
  const modelFiles = loadJsonFiles(paths.getDataJsonPath("models"));
  const lengthFiles = loadJsonFiles(paths.getDataJsonPath("lengths"));
  const seoFiles = loadJsonFiles(paths.getDataJsonPath("seo"));
  const metaFiles = loadJsonFiles(paths.getDataJsonPath("meta"));
  
  // Извлечение объектов
  const seriesObjects = extractObjects(seriesFiles);
  const modelObjects = extractObjects(modelFiles);
  const lengthObjects = extractObjects(lengthFiles);
  const seoObjects = extractObjects(seoFiles);
  
  // Построение карт
  const seriesMap = new Map(); // key: id или slug
  const seriesSlugMap = new Map(); // key: slug
  const modelsMap = new Map(); // key: id или slug
  const modelSlugMap = new Map(); // key: slug
  const lengthsMap = new Map(); // key: id
  const lengthSlugMap = new Map(); // key: slug (если есть)
  const seoMap = new Map(); // key: id
  
  // A) Проверка уникальности ID и построение карт для Series
  for (const { file, item } of seriesObjects) {
    const id = item.id;
    const slug = item.slug;
    
    if (id) {
      if (seriesMap.has(id)) {
        errors.push({
          type: "DUPLICATE_ID",
          file: file,
          id: id
        });
      } else {
        seriesMap.set(id, item);
      }
    }
    
    if (slug) {
      if (seriesSlugMap.has(slug)) {
        errors.push({
          type: "DUPLICATE_SLUG",
          file: file,
          id: slug
        });
      } else {
        seriesSlugMap.set(slug, item);
      }
    }
  }
  
  // A) Проверка уникальности ID и построение карт для Models
  for (const { file, item } of modelObjects) {
    const id = item.id;
    const slug = item.slug;
    
    if (id) {
      if (modelsMap.has(id)) {
        errors.push({
          type: "DUPLICATE_ID",
          file: file,
          id: id
        });
      } else {
        modelsMap.set(id, item);
      }
    }
    
    if (slug) {
      if (modelSlugMap.has(slug)) {
        errors.push({
          type: "DUPLICATE_SLUG",
          file: file,
          id: slug
        });
      } else {
        modelSlugMap.set(slug, item);
      }
    }
  }
  
  // A) Проверка уникальности ID и построение карт для Lengths
  for (const { file, item } of lengthObjects) {
    const id = item.id;
    const slug = item.slug;
    
    if (id) {
      if (lengthsMap.has(id)) {
        errors.push({
          type: "DUPLICATE_ID",
          file: file,
          id: id
        });
      } else {
        lengthsMap.set(id, item);
      }
    }
    
    if (slug) {
      if (lengthSlugMap.has(slug)) {
        errors.push({
          type: "DUPLICATE_SLUG",
          file: file,
          id: slug
        });
      } else {
        lengthSlugMap.set(slug, item);
      }
    }
  }
  
  // A) Проверка уникальности ID для SEO
  for (const { file, item } of seoObjects) {
    const id = item.id;
    
    if (id) {
      if (seoMap.has(id)) {
        errors.push({
          type: "DUPLICATE_ID",
          file: file,
          id: id
        });
      } else {
        seoMap.set(id, item);
      }
    }
  }
  
  // B) Проверка связей Models → Series
  for (const { file, item } of modelObjects) {
    const seriesSlug = item.series_slug;
    
    if (seriesSlug && !seriesSlugMap.has(seriesSlug)) {
      errors.push({
        type: "MISSING_SERIES_REFERENCE",
        file: file,
        id: item.id || item.slug,
        reference: seriesSlug
      });
    }
  }
  
  // C) Проверка связей Lengths → Models
  for (const { file, item } of lengthObjects) {
    const modelSlug = item.model_slug;
    
    if (modelSlug && !modelSlugMap.has(modelSlug)) {
      errors.push({
        type: "MISSING_MODEL_REFERENCE",
        file: file,
        id: item.id || item.slug,
        reference: modelSlug
      });
    }
  }
  
  // D) Проверка связей SEO → Models/Lengths/Series
  for (const { file, item } of seoObjects) {
    const entityType = item.entity_type;
    const entitySlug = item.entity_slug;
    
    if (!entityType || !entitySlug) {
      continue;
    }
    
    if (entityType === "series") {
      if (!seriesSlugMap.has(entitySlug)) {
        errors.push({
          type: "MISSING_SERIES_REFERENCE",
          file: file,
          id: item.id,
          reference: entitySlug
        });
      }
    } else if (entityType === "model") {
      if (!modelSlugMap.has(entitySlug)) {
        errors.push({
          type: "MISSING_MODEL_REFERENCE",
          file: file,
          id: item.id,
          reference: entitySlug
        });
      }
    } else if (entityType === "length") {
      if (!lengthSlugMap.has(entitySlug)) {
        errors.push({
          type: "MISSING_LENGTH_REFERENCE",
          file: file,
          id: item.id,
          reference: entitySlug
        });
      }
    }
  }
  
  // E) Поиск "осиротевших" объектов уже выполнен выше
  // (проверки B, C, D находят отсутствующие ссылки)
  
  // Статистика
  const stats = {
    series: seriesObjects.length,
    models: modelObjects.length,
    lengths: lengthObjects.length,
    seo: seoObjects.length,
    meta: metaFiles.length
  };
  
  return {
    scope: "audit-structure",
    status: errors.length > 0 ? "error" : "ok",
    errors: errors,
    warnings: warnings,
    stats: stats
  };
}
