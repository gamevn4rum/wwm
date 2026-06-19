export interface SheetRow {
  [key: string]: string | number | boolean | null;
}

export interface SheetRange {
  range: string;
  majorDimension: string;
  values: string[][];
}
