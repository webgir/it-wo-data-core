import fs from "fs";
import path from "path";

/**
 * Загружает diff из файла
 */
function loadDiff(diffPath) {
  if (!fs.existsSync(diffPath)) {
    throw new Error(`Diff файл не найден: ${diffPath}`);
  }
  
  return JSON.parse(fs.readFileSync(diffPath, 'utf-8'));
}

/**
 * Получает идентификатор объекта
 */
function getObjectId(obj, category) {
  if (category === 'series') {
    return obj.series || obj.slug || obj.id || 'unknown';
  } else if (category === 'models') {
    return obj.slug || obj.model_code || obj.id || 'unknown';
  } else if (category === 'lengths') {
    return obj.slug || obj.id || 'unknown';
  }
  return obj.id || obj.slug || 'unknown';
}

/**
 * Форматирует изменение для changelog
 */
function formatChange(item, type, category) {
  let result = '';
  const id = getObjectId(item, category);
  
  if (type === 'added') {
    result = `+ **Добавлено**: \`${id}\``;
    if (item.slug && category !== 'series') {
      result += ` (slug: \`${item.slug}\`)`;
    }
  } else if (type === 'removed') {
    result = `- **Удалено**: \`${id}\``;
    if (item.slug && category !== 'series') {
      result += ` (slug: \`${item.slug}\`)`;
    }
  } else if (type === 'changed') {
    const change = item; // item уже содержит { from, to }
    const id = getObjectId(change.to, category);
    result = `~ **Изменено**: \`${id}\``;
    if (change.to.slug && category !== 'series') {
      result += ` (slug: \`${change.to.slug}\`)`;
    }
    
    // Определяем, что именно изменилось
    const changes = [];
    const oldKeys = Object.keys(change.from);
    const newKeys = Object.keys(change.to);
    
    const addedKeys = newKeys.filter(k => !oldKeys.includes(k));
    const removedKeys = oldKeys.filter(k => !newKeys.includes(k));
    const modifiedKeys = oldKeys.filter(k => {
      return newKeys.includes(k) && 
             JSON.stringify(change.from[k]) !== JSON.stringify(change.to[k]);
    });
    
    if (addedKeys.length > 0) {
      changes.push(`добавлены поля: ${addedKeys.join(', ')}`);
    }
    if (removedKeys.length > 0) {
      changes.push(`удалены поля: ${removedKeys.join(', ')}`);
    }
    if (modifiedKeys.length > 0) {
      changes.push(`изменены поля: ${modifiedKeys.join(', ')}`);
    }
    
    if (changes.length > 0) {
      result += `\n  - ${changes.join('; ')}`;
    }
  }
  
  return result;
}

/**
 * Генерирует changelog из diff
 */
export function generateChangelog(diffPath) {
  const diff = loadDiff(diffPath);
  
  const changelog = {
    timestamp: diff.meta.generatedAt,
    oldVersion: diff.meta.fromVersion,
    newVersion: diff.meta.toVersion,
    summary: diff.summary,
    changes: {
      series: {
        added: [],
        removed: [],
        changed: []
      },
      models: {
        added: [],
        removed: [],
        changed: []
      },
      lengths: {
        added: [],
        removed: [],
        changed: []
      }
    }
  };
  
  // Форматируем изменения для каждой категории
  for (const category of ['series', 'models', 'lengths']) {
    for (const item of diff[category].added) {
      changelog.changes[category].added.push(formatChange(item, 'added', category));
    }
    
    for (const item of diff[category].removed) {
      changelog.changes[category].removed.push(formatChange(item, 'removed', category));
    }
    
    for (const item of diff[category].changed) {
      changelog.changes[category].changed.push(formatChange(item, 'changed', category));
    }
  }
  
  return changelog;
}

/**
 * Форматирует changelog в Markdown
 */
function formatChangelogMarkdown(changelog) {
  let md = `# Changelog\n\n`;
  md += `**Версия**: ${changelog.newVersion || 'current'}\n`;
  md += `**Дата**: ${new Date(changelog.timestamp).toLocaleString('ru-RU')}\n`;
  if (changelog.oldVersion) {
    md += `**Предыдущая версия**: ${changelog.oldVersion}\n`;
  }
  md += `\n`;
  
  md += `## Сводка\n\n`;
  md += `### Series\n`;
  md += `- Добавлено: ${changelog.summary.series.added}, Удалено: ${changelog.summary.series.removed}, Изменено: ${changelog.summary.series.changed}\n`;
  md += `\n### Models\n`;
  md += `- Добавлено: ${changelog.summary.models.added}, Удалено: ${changelog.summary.models.removed}, Изменено: ${changelog.summary.models.changed}\n`;
  md += `\n### Lengths\n`;
  md += `- Добавлено: ${changelog.summary.lengths.added}, Удалено: ${changelog.summary.lengths.removed}, Изменено: ${changelog.summary.lengths.changed}\n`;
  md += `\n`;
  
  // Series
  if (changelog.changes.series.added.length > 0 || 
      changelog.changes.series.removed.length > 0 || 
      changelog.changes.series.changed.length > 0) {
    md += `## Series\n\n`;
    
    if (changelog.changes.series.added.length > 0) {
      md += `### Добавлено\n\n`;
      for (const change of changelog.changes.series.added) {
        md += `${change}\n`;
      }
      md += `\n`;
    }
    
    if (changelog.changes.series.removed.length > 0) {
      md += `### Удалено\n\n`;
      for (const change of changelog.changes.series.removed) {
        md += `${change}\n`;
      }
      md += `\n`;
    }
    
    if (changelog.changes.series.changed.length > 0) {
      md += `### Изменено\n\n`;
      for (const change of changelog.changes.series.changed) {
        md += `${change}\n`;
      }
      md += `\n`;
    }
  }
  
  // Models
  if (changelog.changes.models.added.length > 0 || 
      changelog.changes.models.removed.length > 0 || 
      changelog.changes.models.changed.length > 0) {
    md += `## Models\n\n`;
    
    if (changelog.changes.models.added.length > 0) {
      md += `### Добавлено\n\n`;
      for (const change of changelog.changes.models.added) {
        md += `${change}\n`;
      }
      md += `\n`;
    }
    
    if (changelog.changes.models.removed.length > 0) {
      md += `### Удалено\n\n`;
      for (const change of changelog.changes.models.removed) {
        md += `${change}\n`;
      }
      md += `\n`;
    }
    
    if (changelog.changes.models.changed.length > 0) {
      md += `### Изменено\n\n`;
      for (const change of changelog.changes.models.changed) {
        md += `${change}\n`;
      }
      md += `\n`;
    }
  }
  
  // Lengths
  if (changelog.changes.lengths.added.length > 0 || 
      changelog.changes.lengths.removed.length > 0 || 
      changelog.changes.lengths.changed.length > 0) {
    md += `## Lengths\n\n`;
    
    if (changelog.changes.lengths.added.length > 0) {
      md += `### Добавлено\n\n`;
      for (const change of changelog.changes.lengths.added) {
        md += `${change}\n`;
      }
      md += `\n`;
    }
    
    if (changelog.changes.lengths.removed.length > 0) {
      md += `### Удалено\n\n`;
      for (const change of changelog.changes.lengths.removed) {
        md += `${change}\n`;
      }
      md += `\n`;
    }
    
    if (changelog.changes.lengths.changed.length > 0) {
      md += `### Изменено\n\n`;
      for (const change of changelog.changes.lengths.changed) {
        md += `${change}\n`;
      }
      md += `\n`;
    }
  }
  
  return md;
}

/**
 * Сохраняет changelog
 */
export function saveChangelog(changelog, format = 'markdown') {
  const changelogDir = path.join(process.cwd(), 'data', 'changelog');
  
  if (!fs.existsSync(changelogDir)) {
    fs.mkdirSync(changelogDir, { recursive: true });
  }
  
  if (format === 'markdown') {
    const md = formatChangelogMarkdown(changelog);
    const fileName = `changelog-${changelog.newVersion || 'current'}.md`;
    const filePath = path.join(changelogDir, fileName);
    fs.writeFileSync(filePath, md, 'utf-8');
    return filePath;
  } else {
    const fileName = `changelog-${changelog.newVersion || 'current'}.json`;
    const filePath = path.join(changelogDir, fileName);
    fs.writeFileSync(filePath, JSON.stringify(changelog, null, 2), 'utf-8');
    return filePath;
  }
}

/**
 * Форматирует список изменений для changelog
 */
function formatChangesList(items, category) {
  if (items.length === 0) {
    return '';
  }
  
  const lines = [];
  for (const item of items) {
    const id = getObjectId(item, category);
    lines.push(`- ${category}: \`${id}\``);
  }
  
  return lines.join('\n');
}

/**
 * Форматирует список изменений для changed (только ID)
 */
function formatChangedList(changes, category) {
  if (changes.length === 0) {
    return '';
  }
  
  const lines = [];
  for (const change of changes) {
    const id = getObjectId(change.to, category);
    lines.push(`- ${category}: \`${id}\``);
  }
  
  return lines.join('\n');
}

/**
 * Форматирует сводку изменений
 */
function formatSummary(summary) {
  const total = {
    added: summary.series.added + summary.models.added + summary.lengths.added,
    removed: summary.series.removed + summary.models.removed + summary.lengths.removed,
    changed: summary.series.changed + summary.models.changed + summary.lengths.changed
  };
  
  const parts = [];
  if (total.added > 0) parts.push(`добавлено: ${total.added}`);
  if (total.removed > 0) parts.push(`удалено: ${total.removed}`);
  if (total.changed > 0) parts.push(`изменено: ${total.changed}`);
  
  return parts.length > 0 ? parts.join(', ') : 'нет изменений';
}

/**
 * Создаёт Markdown блок для версии
 */
function createVersionBlock(diff) {
  const toVersion = diff.meta.toVersion;
  const fromVersion = diff.meta.fromVersion;
  const date = new Date(diff.meta.generatedAt);
  const dateStr = date.toLocaleDateString('ru-RU', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  
  let block = `## ${toVersion} — ${dateStr}\n\n`;
  
  if (fromVersion) {
    block += `**Источники:** перенос из ${fromVersion}\n`;
  } else {
    block += `**Источники:** начальная версия\n`;
  }
  
  block += `**Общее:** ${formatSummary(diff.summary)}\n\n`;
  
  // Добавлено
  const addedLines = [];
  if (diff.series.added.length > 0) {
    addedLines.push(formatChangesList(diff.series.added, 'series'));
  }
  if (diff.models.added.length > 0) {
    addedLines.push(formatChangesList(diff.models.added, 'models'));
  }
  if (diff.lengths.added.length > 0) {
    addedLines.push(formatChangesList(diff.lengths.added, 'lengths'));
  }
  
  if (addedLines.length > 0) {
    block += `### Добавлено\n\n`;
    block += addedLines.join('\n');
    block += `\n\n`;
  }
  
  // Изменено
  const changedLines = [];
  if (diff.series.changed.length > 0) {
    changedLines.push(formatChangedList(diff.series.changed, 'series'));
  }
  if (diff.models.changed.length > 0) {
    changedLines.push(formatChangedList(diff.models.changed, 'models'));
  }
  if (diff.lengths.changed.length > 0) {
    changedLines.push(formatChangedList(diff.lengths.changed, 'lengths'));
  }
  
  if (changedLines.length > 0) {
    block += `### Изменено\n\n`;
    block += changedLines.join('\n');
    block += `\n\n`;
  }
  
  // Удалено
  const removedLines = [];
  if (diff.series.removed.length > 0) {
    removedLines.push(formatChangesList(diff.series.removed, 'series'));
  }
  if (diff.models.removed.length > 0) {
    removedLines.push(formatChangesList(diff.models.removed, 'models'));
  }
  if (diff.lengths.removed.length > 0) {
    removedLines.push(formatChangesList(diff.lengths.removed, 'lengths'));
  }
  
  if (removedLines.length > 0) {
    block += `### Удалено\n\n`;
    block += removedLines.join('\n');
    block += `\n\n`;
  }
  
  block += `---\n\n`;
  
  return block;
}

/**
 * Обновляет changelog файл, добавляя новую версию в начало
 */
export async function updateChangelogFromDiff(diff, {
  changelogPath = "data/changelog/data-changelog.md"
} = {}) {
  const fullPath = path.join(process.cwd(), changelogPath);
  
  // Создаём директорию, если её нет
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  // Создаём новый блок версии
  const newBlock = createVersionBlock(diff);
  
  // Читаем существующий changelog (если есть)
  let existingContent = '';
  if (fs.existsSync(fullPath)) {
    existingContent = fs.readFileSync(fullPath, 'utf-8');
  } else {
    // Если файла нет, создаём заголовок
    existingContent = `# Data Changelog\n\n`;
  }
  
  // Добавляем новый блок в начало (после заголовка, если есть)
  let updatedContent = '';
  if (existingContent.startsWith('# ')) {
    const headerEnd = existingContent.indexOf('\n\n');
    if (headerEnd !== -1) {
      const header = existingContent.substring(0, headerEnd + 2);
      const body = existingContent.substring(headerEnd + 2);
      updatedContent = header + newBlock + body;
    } else {
      updatedContent = existingContent + '\n' + newBlock;
    }
  } else {
    updatedContent = newBlock + existingContent;
  }
  
  // Сохраняем обновлённый changelog
  fs.writeFileSync(fullPath, updatedContent, 'utf-8');
  
  console.log(`✅ Changelog обновлён: ${fullPath}`);
  console.log(`   Версия: ${diff.meta.toVersion}`);
  console.log(`   Добавлено: ${diff.summary.series.added + diff.summary.models.added + diff.summary.lengths.added}`);
  console.log(`   Изменено: ${diff.summary.series.changed + diff.summary.models.changed + diff.summary.lengths.changed}`);
  console.log(`   Удалено: ${diff.summary.series.removed + diff.summary.models.removed + diff.summary.lengths.removed}`);
  
  return fullPath;
}

/**
 * Основная функция генерации changelog
 */
export function createChangelog(diffPath, format = 'markdown') {
  console.log(`📖 Загрузка diff: ${diffPath}`);
  const changelog = generateChangelog(diffPath);
  
  console.log('📝 Генерация changelog...');
  const changelogPath = saveChangelog(changelog, format);
  
  console.log(`✅ Changelog создан: ${changelogPath}`);
  console.log(`\nSeries: Добавлено: ${changelog.summary.series.added}, Удалено: ${changelog.summary.series.removed}, Изменено: ${changelog.summary.series.changed}`);
  console.log(`Models: Добавлено: ${changelog.summary.models.added}, Удалено: ${changelog.summary.models.removed}, Изменено: ${changelog.summary.models.changed}`);
  console.log(`Lengths: Добавлено: ${changelog.summary.lengths.added}, Удалено: ${changelog.summary.lengths.removed}, Изменено: ${changelog.summary.lengths.changed}`);
  
  return changelogPath;
}

// Если запущен напрямую
if (import.meta.url === `file://${process.argv[1]}`) {
  const diffPath = process.argv[2];
  const format = process.argv[3] || 'markdown';
  
  if (!diffPath) {
    console.error('Использование: node scripts/changelog.mjs <путь-к-diff-файлу> [format]');
    process.exit(1);
  }
  
  createChangelog(diffPath, format);
}

export default createChangelog;

