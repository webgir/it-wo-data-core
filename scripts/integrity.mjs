// scripts/integrity.mjs

import fs from "fs";
import path from "path";
import crypto from "crypto";

/**
 * calculateHashes(baseDir)
 * Возвращает Map: filepath → sha256 hash
 */
export function calculateHashes(baseDir) {
  const result = new Map();

  function walk(dir) {
    for (const file of fs.readdirSync(dir)) {
      const full = path.join(dir, file);
      const stat = fs.statSync(full);

      if (stat.isDirectory()) {
        walk(full);
      } else if (file.endsWith(".json")) {
        const json = JSON.stringify(JSON.parse(fs.readFileSync(full, "utf8")));
        const hash = crypto.createHash("sha256").update(json).digest("hex");
        result.set(path.relative(baseDir, full), hash);
      }
    }
  }

  walk(baseDir);
  return result;
}

/**
 * checkIntegrity(previous, current)
 * previous — объект integrity.json
 * current — Map(filepath → hash)
 */
export function checkIntegrity(previous, current, diff) {
  const silent = [];

  for (const [file, oldHash] of Object.entries(previous)) {
    const newHash = current.get(file);

    // Файл существовал, но изменился
    if (newHash && newHash !== oldHash) {
      const isDocumented = isInDiff(file, diff);
      if (!isDocumented) silent.push(file);
    }
  }

  if (silent.length) {
    return {
      status: "error",
      silent,
      message: "Обнаружены незадокументированные изменения"
    };
  }

  return {
    status: "ok"
  };
}

function isInDiff(file, diff) {
  // Минимальное приближение:
  // При реальной реализации — сопоставляем file → entity_slug.
  const f = file.toLowerCase();

  return (
    diff.changed?.some(e => f.includes(e.slug)) ||
    diff.added?.some(e => f.includes(e.slug)) ||
    diff.removed?.some(e => f.includes(e.slug))
  );
}


