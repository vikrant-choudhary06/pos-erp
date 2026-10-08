import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

export type Config = {
  cloudUrl: string;
  port: number;
  billPrinter: string;
  kotPrinter: string;
  startWithWindows: boolean;
};

const DEFAULTS: Config = {
  cloudUrl: '',
  port: 7400,
  billPrinter: '',
  kotPrinter: '',
  startWithWindows: true,
};

const file = () => path.join(app.getPath('userData'), 'config.json');

export function loadConfig(): Config {
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file(), 'utf8')) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveConfig(config: Config) {
  fs.writeFileSync(file(), JSON.stringify(config, null, 2));
}

/** "counter.example.com" -> "https://counter.example.com", without a trailing slash. */
export function cleanUrl(input: string) {
  const value = input.trim();
  if (!value) return '';
  const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  return url.origin;
}
