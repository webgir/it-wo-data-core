/**
 * Утилиты для единого логирования в стиле IWDC
 * Использует стандартные эмодзи и форматирование
 */

/**
 * Выводит заголовок шага с разделителем
 * @param {string} title - название шага
 * @param {string} emoji - эмодзи для шага (по умолчанию 📋)
 */
export function logStep(title, emoji = "📋") {
  console.log(`\n${emoji} ${title}`);
  console.log('-'.repeat(60));
}

/**
 * Выводит сообщение об успехе
 * @param {string} message - сообщение
 */
export function logSuccess(message) {
  console.log(`✅ ${message}`);
}

/**
 * Выводит сообщение об ошибке
 * @param {string} message - сообщение
 */
export function logError(message) {
  console.error(`❌ ${message}`);
}

/**
 * Выводит информационное сообщение
 * @param {string} message - сообщение
 * @param {boolean} useArrow - использовать стрелку → вместо ℹ️
 */
export function logInfo(message, useArrow = false) {
  const prefix = useArrow ? '➡️' : 'ℹ️';
  console.log(`${prefix}  ${message}`);
}

/**
 * Выводит предупреждение
 * @param {string} message - сообщение
 */
export function logWarning(message) {
  console.log(`⚠️  ${message}`);
}

/**
 * Выводит секцию с эмодзи
 * @param {string} title - название секции
 * @param {string} emoji - эмодзи (по умолчанию 📊)
 */
export function logSection(title, emoji = "📊") {
  console.log(`\n${emoji} ${title}`);
}

/**
 * Выводит разделитель
 * @param {number} length - длина разделителя (по умолчанию 60)
 */
export function logSeparator(length = 60) {
  console.log('='.repeat(length));
}

/**
 * Выводит заголовок с разделителями (для начала/конца процесса)
 * @param {string} title - заголовок
 * @param {string} emoji - эмодзи
 */
export function logHeader(title, emoji = "🚀") {
  console.log(`\n${emoji} ${title}\n`);
  logSeparator();
}


