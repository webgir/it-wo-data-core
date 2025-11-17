import { buildDataDiff, saveDataDiff } from "../../scripts/diff.mjs";
import { updateChangelogFromDiff } from "../../scripts/changelog.mjs";
import { getLatestVersion } from "../../scripts/snapshot-version.mjs";

/**
 * Парсит аргументы командной строки
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    from: null,
    to: null,
    withChangelog: false
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--from' && i + 1 < args.length) {
      options.from = args[i + 1];
      i++;
    } else if (arg === '--to' && i + 1 < args.length) {
      options.to = args[i + 1];
      i++;
    } else if (arg === '--with-changelog') {
      options.withChangelog = true;
    }
  }
  
  return options;
}

/**
 * Основная функция CLI
 */
async function main() {
  const options = parseArgs();
  
  // Если from не указан, берём последнюю версию
  let fromVersion = options.from;
  if (!fromVersion) {
    fromVersion = getLatestVersion();
    if (!fromVersion) {
      console.error('❌ Ошибка: не указана версия --from и не найдена последняя версия');
      console.error('Использование: node tools/cli/iwdc-diff.mjs --from <ver> --to <ver> [--with-changelog]');
      process.exit(1);
    }
    console.log(`📖 Используется последняя версия: ${fromVersion}`);
  }
  
  // Если to не указан, используем 'current' (потребуется snapshot)
  let toVersion = options.to;
  if (!toVersion) {
    console.error('❌ Ошибка: не указана версия --to');
    console.error('Использование: node tools/cli/iwdc-diff.mjs --from <ver> --to <ver> [--with-changelog]');
    process.exit(1);
  }
  
  try {
    // Строим diff
    console.log(`🔍 Сравнение версий: ${fromVersion} → ${toVersion}`);
    const diff = await buildDataDiff({
      fromVersion: fromVersion,
      toVersion: toVersion
    });
    
    // Сохраняем diff
    const diffPath = await saveDataDiff(diff);
    
    // Обновляем changelog, если указан флаг
    if (options.withChangelog) {
      console.log('📝 Обновление changelog...');
      await updateChangelogFromDiff(diff);
    }
    
    // Вычисляем общую сводку
    const summary = {
      added: diff.summary.series.added + diff.summary.models.added + diff.summary.lengths.added,
      removed: diff.summary.series.removed + diff.summary.models.removed + diff.summary.lengths.removed,
      changed: diff.summary.series.changed + diff.summary.models.changed + diff.summary.lengths.changed
    };
    
    // Финальный вывод
    console.log('\n' + '='.repeat(60));
    console.log('IWDC DIFF READY');
    console.log('='.repeat(60));
    console.log(`from: ${fromVersion}`);
    console.log(`to: ${toVersion}`);
    console.log(`added/removed/changed — ${summary.added}/${summary.removed}/${summary.changed}`);
    console.log(`file: ${diffPath}`);
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Запускаем CLI
main();
