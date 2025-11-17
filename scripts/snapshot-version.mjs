import fs from "fs";
import path from "path";
import { createHash } from "crypto";

/**
 * Рекурсивно копирует директорию
 */
function copyDirectory(src, dest) {
  if (!fs.existsSync(src)) {
    return;
  }
  
  // Создаём целевую директорию
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Находит XLS/XLSX файлы в sources/xls/
 */
function findXlsFiles() {
  const xlsDir = path.join(process.cwd(), 'sources', 'xls');
  const files = [];
  
  if (!fs.existsSync(xlsDir)) {
    return files;
  }
  
  const entries = fs.readdirSync(xlsDir, { withFileTypes: true });
  
  for (const entry of entries) {
    if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (ext === '.xls' || ext === '.xlsx') {
        files.push({
          name: entry.name,
          path: path.join(xlsDir, entry.name),
          relativePath: path.relative(process.cwd(), path.join(xlsDir, entry.name))
        });
      }
    }
  }
  
  return files;
}

/**
 * Вычисляет SHA256 хэш файла
 */
function getFileHash(filePath) {
  const buffer = fs.readFileSync(filePath);
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Создаёт снимок версии данных
 */
export function snapshotVersion(version = null) {
  const jsonDir = path.join(process.cwd(), 'data', 'json');
  const versionsDir = path.join(process.cwd(), 'data', 'versions');
  
  // Создаём директорию версий, если её нет
  if (!fs.existsSync(versionsDir)) {
    fs.mkdirSync(versionsDir, { recursive: true });
  }
  
  // Генерируем версию, если не указана
  const newVersion = version || generateVersionId();
  
  // Путь к директории версии
  const versionDir = path.join(versionsDir, newVersion);
  
  // Копируем data/json/ → data/versions/<newVersion>/
  console.log(`📂 Копирование data/json/ → data/versions/${newVersion}/...`);
  copyDirectory(jsonDir, versionDir);
  
  // Находим XLS файлы и вычисляем хэш
  const xlsFiles = findXlsFiles();
  let xlsHash = null;
  let sourcePath = null;
  
  if (xlsFiles.length > 0) {
    // Берём первый найденный XLS файл
    const xlsFile = xlsFiles[0];
    sourcePath = xlsFile.relativePath;
    xlsHash = getFileHash(xlsFile.path);
    console.log(`📄 Найден источник: ${xlsFile.name}`);
    console.log(`   Хэш: ${xlsHash.substring(0, 16)}...`);
  }
  
  // Создаём meta.json
  const meta = {
    version: newVersion,
    date: new Date().toISOString(),
    xlsHash: xlsHash,
    sourcePath: sourcePath
  };
  
  const metaPath = path.join(versionDir, 'meta.json');
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
  
  console.log(`✅ Снимок версии создан: ${newVersion}`);
  console.log(`   Путь: ${versionDir}`);
  console.log(`   Meta: ${metaPath}`);
  
  return {
    version: newVersion,
    path: versionDir,
    meta: meta
  };
}

/**
 * Генерирует ID версии на основе timestamp
 */
function generateVersionId() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  const second = String(now.getSeconds()).padStart(2, '0');
  
  return `${year}${month}${day}-${hour}${minute}${second}`;
}

/**
 * Получает последнюю версию
 */
export function getLatestVersion() {
  const versionsDir = path.join(process.cwd(), 'data', 'versions');
  
  if (!fs.existsSync(versionsDir)) {
    return null;
  }
  
  const entries = fs.readdirSync(versionsDir, { withFileTypes: true });
  const versions = [];
  
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const metaPath = path.join(versionsDir, entry.name, 'meta.json');
      if (fs.existsSync(metaPath)) {
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
          versions.push({
            version: meta.version,
            date: meta.date,
            path: entry.name
          });
        } catch (error) {
          // Пропускаем некорректные meta.json
        }
      }
    }
  }
  
  if (versions.length === 0) {
    return null;
  }
  
  // Сортируем по дате (новые первыми)
  versions.sort((a, b) => new Date(b.date) - new Date(a.date));
  
  return versions[0].version;
}

// Если запущен напрямую
if (import.meta.url === `file://${process.argv[1]}`) {
  const version = process.argv[2] || null;
  snapshotVersion(version);
}

export default snapshotVersion;
