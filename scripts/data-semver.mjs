// scripts/data-semver.mjs

import { readFileSync } from "fs";
import path from "path";

/**
 * dataSemver(diff)
 * Принимает diff формата IWDC.
 * Возвращает уровень версии, причину и рекомендацию.
 */
export function dataSemver(diff, currentVersion) {
  const reasons = [];
  let level = "patch";

  // --- MAJOR ---
  if (diff.series?.removed?.length) {
    level = "major";
    reasons.push("Удалены серии");
  }
  if (diff.models?.removed?.length) {
    level = "major";
    reasons.push("Удалены модели");
  }
  if (diff.lengths?.removed?.length) {
    level = "major";
    reasons.push("Удалены длины");
  }
  if (diff.changedIds?.length) {
    level = "major";
    reasons.push("Изменены ID");
  }
  if (diff.changedTypes?.length) {
    level = "major";
    reasons.push("Изменены типы полей");
  }

  // --- MINOR ---
  if (level !== "major") {
    if (diff.series?.added?.length) {
      level = "minor";
      reasons.push("Добавлены серии");
    }
    if (diff.models?.added?.length) {
      level = "minor";
      reasons.push("Добавлены модели");
    }
    if (diff.lengths?.added?.length) {
      level = "minor";
      reasons.push("Добавлены длины");
    }
  }

  // --- PATCH (по умолчанию) ---
  if (reasons.length === 0) {
    reasons.push("Правки данных без изменения структуры");
  }

  const recommendedVersion = bumpVersion(currentVersion, level);

  return {
    status: "ok",
    level,
    reasons,
    recommendedVersion
  };
}

function bumpVersion(current, level) {
  const [major, minor, patch] = current.split(".").map(Number);

  if (level === "major") return `${major + 1}.0.0`;
  if (level === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}


