/**
 * Утилиты для нормализации diff в формат data-semver
 */

/**
 * Преобразует IWDC diff в формат, ожидаемый dataSemver
 * @param {object} iwdcDiff - diff в формате IWDC
 * @returns {object} Diff в формате data-semver
 */
export function normalizeDiffForSemver(iwdcDiff) {
  // dataSemver ожидает объекты с полями added/removed/changed как массивы
  const semverDiff = {
    series: {
      added: (iwdcDiff.summary?.series?.added > 0 && iwdcDiff.series?.added) ? iwdcDiff.series.added : [],
      removed: (iwdcDiff.summary?.series?.removed > 0 && iwdcDiff.series?.removed) ? iwdcDiff.series.removed : [],
      changed: (iwdcDiff.summary?.series?.changed > 0 && iwdcDiff.series?.changed) ? iwdcDiff.series.changed : []
    },
    models: {
      added: (iwdcDiff.summary?.models?.added > 0 && iwdcDiff.models?.added) ? iwdcDiff.models.added : [],
      removed: (iwdcDiff.summary?.models?.removed > 0 && iwdcDiff.models?.removed) ? iwdcDiff.models.removed : [],
      changed: (iwdcDiff.summary?.models?.changed > 0 && iwdcDiff.models?.changed) ? iwdcDiff.models.changed : []
    },
    lengths: {
      added: (iwdcDiff.summary?.lengths?.added > 0 && iwdcDiff.lengths?.added) ? iwdcDiff.lengths.added : [],
      removed: (iwdcDiff.summary?.lengths?.removed > 0 && iwdcDiff.lengths?.removed) ? iwdcDiff.lengths.removed : [],
      changed: (iwdcDiff.summary?.lengths?.changed > 0 && iwdcDiff.lengths?.changed) ? iwdcDiff.lengths.changed : []
    },
    // TODO: После полной реализации bc-validator можно добавить changedIds и changedTypes
    // Эти данные можно получить из результатов bc-validator аудита
    changedIds: [],
    changedTypes: []
  };
  
  return semverDiff;
}


