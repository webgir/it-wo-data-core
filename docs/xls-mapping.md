# Маппинг XLS → CSV

Этот документ описывает, как исходные XLS/XLSX преобразуются в унифицированные CSV.

## 1. Общий принцип

- Один или несколько файлов XLS/XLSX в `sources/xls/`.
- Каждый лист может соответствовать:
  - определённой высоте,
  - типу прибора,
  - части каталога.
- Для каждого листа задаётся конфигурация:
  - диапазон строк,
  - используемые колонки,
  - тип данных.

## 2. Конфигурация маппинга (пример)

Планируемый формат конфига (TypeScript/JS):

```ts
// scripts/xls-config.example.mjs
export const xlsConfig = {
  sourceFile: "sources/xls/price-vitron-2025.xlsx",
  sheets: {
    "65": {
      type: "lengths",
      height_mm: 65,
      startRow: 5,
      columns: {
        article: "A",
        length_mm: "B",
        power_w: "C",
        price_side: "D",
        price_bottom: "E",
        weight_kg: "F"
      }
    }
    // другие листы...
  }
};
