import fs from "fs";
import path from "path";
// Утилиты IWDC v0.6
import * as paths from "../utils/paths.mjs";
import { loadPreviousSnapshot } from "../utils/loadPreviousSnapshot.mjs";
import { writeJsonFile } from "../utils/file.mjs";

/**
 * Глубокое сравнение двух объектов
 */
function deepEqual(obj1, obj2) {
  return JSON.stringify(obj1) === JSON.stringify(obj2);
}

/**
 * Загружает все данные версии (series, models, lengths)
 * Использует утилиту loadPreviousSnapshot из utils
 */
function loadVersion(version) {
  const snapshot = loadPreviousSnapshot(version);
  if (!snapshot) {
    return {
      series: {},
      models: {},
      lengths: {}
    };
  }
  return snapshot;
}

/**
 * Сравнивает две версии данных и строит diff
 */
export async function buildDataDiff({ fromVersion, toVersion, basePath = "data" }) {
  // Используем пути из utils (basePath игнорируется, т.к. paths всегда использует process.cwd())
  const fromVersionPath = paths.getVersionPath(fromVersion);
  const toVersionPath = paths.getVersionPath(toVersion);
  
  // Проверяем существование версий
  if (!fs.existsSync(fromVersionPath)) {
    throw new Error(`Версия ${fromVersion} не найдена в ${fromVersionPath}`);
  }
  
  if (!fs.existsSync(toVersionPath)) {
    throw new Error(`Версия ${toVersion} не найдена в ${toVersionPath}`);
  }
  
  console.log(`📖 Загрузка версии ${fromVersion}...`);
  const fromData = loadVersion(fromVersion);
  
  console.log(`📖 Загрузка версии ${toVersion}...`);
  const toData = loadVersion(toVersion);
  
  console.log('🔍 Вычисление разницы...');
  
  // Инициализируем структуру diff
  const diff = {
    series: { added: [], removed: [], changed: [] },
    models: { added: [], removed: [], changed: [] },
    lengths: { added: [], removed: [], changed: [] }
  };
  
  // Обрабатываем каждую категорию
  for (const category of ['series', 'models', 'lengths']) {
    const fromItems = fromData[category];
    const toItems = toData[category];
    
    const allIds = new Set([
      ...Object.keys(fromItems),
      ...Object.keys(toItems)
    ]);
    
    for (const id of allIds) {
      const fromExists = fromItems.hasOwnProperty(id);
      const toExists = toItems.hasOwnProperty(id);
      
      if (!fromExists && toExists) {
        // Добавлено
        diff[category].added.push(toItems[id]);
      } else if (fromExists && !toExists) {
        // Удалено
        diff[category].removed.push(fromItems[id]);
      } else {
        // Проверяем на изменения (глубокое сравнение)
        if (!deepEqual(fromItems[id], toItems[id])) {
          // Изменено - только from и to
          diff[category].changed.push({
            from: fromItems[id],
            to: toItems[id]
          });
        }
      }
    }
  }
  
  // Вычисляем summary
  const summary = {
    series: {
      added: diff.series.added.length,
      removed: diff.series.removed.length,
      changed: diff.series.changed.length
    },
    models: {
      added: diff.models.added.length,
      removed: diff.models.removed.length,
      changed: diff.models.changed.length
    },
    lengths: {
      added: diff.lengths.added.length,
      removed: diff.lengths.removed.length,
      changed: diff.lengths.changed.length
    }
  };
  
  // Формируем итоговый объект diff
  const result = {
    meta: {
      fromVersion: fromVersion,
      toVersion: toVersion,
      generatedAt: new Date().toISOString()
    },
    summary: summary,
    series: diff.series,
    models: diff.models,
    lengths: diff.lengths
  };
  
  return result;
}

/**
 * Сохраняет diff в файл
 */
export async function saveDataDiff(diff, { basePath = "data" } = {}) {
  // Используем пути из utils (basePath игнорируется)
  const diffsDir = paths.getDiffsPath();
  
  const fromVersion = diff.meta.fromVersion || 'initial';
  const toVersion = diff.meta.toVersion;
  const diffFileName = `${fromVersion}__${toVersion}.diff.json`;
  const diffPath = path.join(diffsDir, diffFileName);
  
  // Используем утилиту для записи JSON
  writeJsonFile(diffPath, diff);
  
  return diffPath;
}

/**
 * Основная функция сравнения (для обратной совместимости)
 */
export async function compareVersions(oldVersionId = null, newVersionId = 'current') {
  const { snapshotVersion, getLatestVersion } = await import('./snapshot-version.mjs');
  
  let fromVersion = oldVersionId;
  
  // Если старая версия не указана, берём последнюю
  if (!fromVersion) {
    fromVersion = getLatestVersion();
    if (!fromVersion) {
      throw new Error('Предыдущая версия не найдена. Создайте снимок версии перед сравнением.');
    }
    console.log(`📖 Используется последняя версия: ${fromVersion}`);
  }
  
  // Если новая версия - 'current', создаём снимок
  let toVersion = newVersionId;
  if (toVersion === 'current') {
    console.log('📸 Создание снимка текущей версии...');
    const manifest = snapshotVersion();
    toVersion = manifest.version;
  }
  
  // Строим diff
  const diff = await buildDataDiff({ fromVersion, toVersion });
  
  // Сохраняем diff
  const diffPath = await saveDataDiff(diff);
  
  // Выводим статистику
  console.log('\n' + '='.repeat(60));
  console.log('📊 РЕЗУЛЬТАТЫ СРАВНЕНИЯ');
  console.log('='.repeat(60));
  console.log(`Старая версия: ${fromVersion}`);
  console.log(`Новая версия: ${toVersion}`);
  console.log('\nSeries:');
  console.log(`  Добавлено: ${diff.summary.series.added}, Удалено: ${diff.summary.series.removed}, Изменено: ${diff.summary.series.changed}`);
  console.log('\nModels:');
  console.log(`  Добавлено: ${diff.summary.models.added}, Удалено: ${diff.summary.models.removed}, Изменено: ${diff.summary.models.changed}`);
  console.log('\nLengths:');
  console.log(`  Добавлено: ${diff.summary.lengths.added}, Удалено: ${diff.summary.lengths.removed}, Изменено: ${diff.summary.lengths.changed}`);
  console.log(`\nDiff сохранён: ${diffPath}`);
  console.log('='.repeat(60));
  
  return {
    oldVersion: fromVersion,
    newVersion: toVersion,
    diff: diff,
    diffPath: diffPath
  };
}

// Если запущен напрямую
if (import.meta.url === `file://${process.argv[1]}`) {
  const fromVersion = process.argv[2] || null;
  compareVersions(fromVersion).catch(error => {
    console.error('❌ Ошибка:', error.message);
    process.exit(1);
  });
}

export default compareVersions;
