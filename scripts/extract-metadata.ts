import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const srcFile = join(process.cwd(), 'node_modules', 'dukascopy-node', 'dist', 'index.js');
const outFile = join(process.cwd(), 'src', 'lib', 'instrumentMetaData.ts');

const code = readFileSync(srcFile, 'utf8');

const match = code.match(/var instrument_meta_data_default = (\{[\s\S]*?\n  \};)/);
if (!match) {
  console.error('Could not find instrument_meta_data_default in dukascopy-node bundle');
  process.exit(1);
}

const rawJson = match[1].replace(/;\s*$/, '');

// Parse, re-stringify with 2-space indent and sorted keys per instrument
const data = eval(`(${rawJson})`);

const entries = Object.entries(data).sort(([a], [b]) => a.localeCompare(b));

const lines: string[] = [
  "export interface InstrumentMetaData {",
  "  name: string;",
  "  description: string;",
  "  decimalFactor: number;",
  "  startHourForTicks: string;",
  "  startDayForMinuteCandles: string;",
  "  startMonthForHourlyCandles: string;",
  "  startYearForDailyCandles: string;",
  "}",
  "",
  "export const instrumentMetaData: Record<string, InstrumentMetaData> = {",
];

for (const [key, value] of entries) {
  lines.push(`  "${key}": {`);
  lines.push(`    name: ${JSON.stringify(value.name)},`);
  lines.push(`    description: ${JSON.stringify(value.description)},`);
  lines.push(`    decimalFactor: ${value.decimalFactor},`);
  lines.push(`    startHourForTicks: ${JSON.stringify(value.startHourForTicks)},`);
  lines.push(`    startDayForMinuteCandles: ${JSON.stringify(value.startDayForMinuteCandles)},`);
  lines.push(`    startMonthForHourlyCandles: ${JSON.stringify(value.startMonthForHourlyCandles)},`);
  lines.push(`    startYearForDailyCandles: ${JSON.stringify(value.startYearForDailyCandles)}`);
  lines.push(`  },`);
}

lines.push("};");

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, lines.join('\n') + '\n', 'utf8');
console.log(`Wrote ${entries.length} instruments to ${outFile}`);
