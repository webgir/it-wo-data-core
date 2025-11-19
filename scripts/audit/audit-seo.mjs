// Утилиты IWDC v0.6
import * as paths from "../../utils/paths.mjs";
import { loadJsonFiles, extractObjects } from "../../utils/file.mjs";

/**
 * Проверяет наличие заглушек в тексте
 */
function hasPlaceholder(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  const placeholders = ['todo', 'tbd', '***', 'lorem', 'описание будет позже', 'заглушка', 'placeholder'];
  return placeholders.some(ph => lower.includes(ph));
}

export async function run(options = {}) {
  const errors = [];
  const warnings = [];
  
  // Загрузка данных
  // Загружаем данные (используем пути из utils)
  const seoFiles = loadJsonFiles(paths.getDataJsonPath("seo"));
  const modelFiles = loadJsonFiles(paths.getDataJsonPath("models"));
  const lengthFiles = loadJsonFiles(paths.getDataJsonPath("lengths"));
  
  // Извлечение объектов
  const seoObjects = extractObjects(seoFiles);
  const modelObjects = extractObjects(modelFiles);
  const lengthObjects = extractObjects(lengthFiles);
  
  // Построение карт для models и lengths
  const modelsMap = new Map(); // key: slug или id
  const lengthsMap = new Map(); // key: slug или id
  
  for (const { item } of modelObjects) {
    if (item.slug) {
      modelsMap.set(item.slug, item);
    }
    if (item.id) {
      modelsMap.set(item.id, item);
    }
  }
  
  for (const { item } of lengthObjects) {
    if (item.slug) {
      lengthsMap.set(item.slug, item);
    }
    if (item.id) {
      lengthsMap.set(item.id, item);
    }
  }
  
  // Карты для проверки дубликатов
  const titleMap = new Map(); // key: title, value: array of entity_slug
  const descriptionMap = new Map(); // key: description, value: array of entity_slug
  
  // Проверка каждого SEO-записи
  for (const { file, item } of seoObjects) {
    const entitySlug = item.entity_slug || '';
    const entityType = item.entity_type || '';
    const id = item.id || '';
    
    // Проверка title
    const title = item.title || '';
    if (!title || title.trim() === '') {
      errors.push({
        type: "BAD_CONTENT",
        file: file,
        id: id,
        field: "title",
        message: "Title is empty"
      });
    } else {
      const titleLen = title.length;
      if (titleLen < 30) {
        warnings.push({
          type: "TITLE_TOO_SHORT",
          file: file,
          id: id,
          field: "title",
          message: `Title is too short: ${titleLen} characters (minimum 30)`
        });
      } else if (titleLen > 70) {
        warnings.push({
          type: "TITLE_TOO_LONG",
          file: file,
          id: id,
          field: "title",
          message: `Title is too long: ${titleLen} characters (maximum 70)`
        });
      }
      
      if (hasPlaceholder(title)) {
        errors.push({
          type: "BAD_CONTENT",
          file: file,
          id: id,
          field: "title",
          message: "Title contains placeholder text"
        });
      }
      
      // Сбор для проверки дубликатов
      if (title) {
        if (!titleMap.has(title)) {
          titleMap.set(title, []);
        }
        titleMap.get(title).push(entitySlug);
      }
    }
    
    // Проверка description
    const description = item.description || '';
    if (!description || description.trim() === '') {
      errors.push({
        type: "BAD_CONTENT",
        file: file,
        id: id,
        field: "description",
        message: "Description is empty"
      });
    } else {
      const descLen = description.length;
      if (descLen < 80) {
        warnings.push({
          type: "DESCRIPTION_TOO_SHORT",
          file: file,
          id: id,
          field: "description",
          message: `Description is too short: ${descLen} characters (minimum 80)`
        });
      } else if (descLen > 200) {
        warnings.push({
          type: "DESCRIPTION_TOO_LONG",
          file: file,
          id: id,
          field: "description",
          message: `Description is too long: ${descLen} characters (maximum 200)`
        });
      }
      
      if (hasPlaceholder(description)) {
        errors.push({
          type: "BAD_CONTENT",
          file: file,
          id: id,
          field: "description",
          message: "Description contains placeholder text"
        });
      }
      
      // Сбор для проверки дубликатов
      if (description) {
        if (!descriptionMap.has(description)) {
          descriptionMap.set(description, []);
        }
        descriptionMap.get(description).push(entitySlug);
      }
    }
    
    // Проверка h1
    const h1 = item.h1 || '';
    if (!h1 || h1.trim() === '') {
      errors.push({
        type: "BAD_CONTENT",
        file: file,
        id: id,
        field: "h1",
        message: "H1 is empty"
      });
    } else {
      // Проверка, что h1 содержит entity_slug для моделей и длин
      if ((entityType === "model" || entityType === "length") && entitySlug) {
        if (!h1.toLowerCase().includes(entitySlug.toLowerCase())) {
          warnings.push({
            type: "H1_MISSING_ENTITY_SLUG",
            file: file,
            id: id,
            field: "h1",
            message: `H1 should contain entity_slug "${entitySlug}"`
          });
        }
      }
    }
    
    // Проверка привязок
    if (entityType === "model") {
      if (!entitySlug || !modelsMap.has(entitySlug)) {
        errors.push({
          type: "MISSING_MODEL_REFERENCE",
          file: file,
          id: id,
          field: "entity_slug",
          message: `Model with slug "${entitySlug}" not found`
        });
      }
    } else if (entityType === "length") {
      if (!entitySlug || !lengthsMap.has(entitySlug)) {
        errors.push({
          type: "MISSING_LENGTH_REFERENCE",
          file: file,
          id: id,
          field: "entity_slug",
          message: `Length with slug "${entitySlug}" not found`
        });
      }
    }
  }
  
  // Проверка дубликатов title
  for (const [title, slugs] of titleMap.entries()) {
    if (slugs.length > 1) {
      warnings.push({
        type: "DUPLICATE_TITLE",
        file: null,
        id: null,
        field: "title",
        message: `Duplicate title found: "${title.substring(0, 50)}..." (used by ${slugs.length} entities: ${slugs.join(', ')})`
      });
    }
  }
  
  // Проверка дубликатов description
  for (const [description, slugs] of descriptionMap.entries()) {
    if (slugs.length > 1) {
      warnings.push({
        type: "DUPLICATE_DESCRIPTION",
        file: null,
        id: null,
        field: "description",
        message: `Duplicate description found (used by ${slugs.length} entities: ${slugs.join(', ')})`
      });
    }
  }
  
  // Статистика
  const stats = {
    total: seoObjects.length,
    errors: errors.length,
    warnings: warnings.length
  };
  
  return {
    scope: "audit-seo",
    status: errors.length > 0 ? "error" : "ok",
    errors: errors,
    warnings: warnings,
    stats: stats
  };
}
