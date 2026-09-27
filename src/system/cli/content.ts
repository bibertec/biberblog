import fs from 'node:fs';
import path from 'node:path';
import { CONTENT_DIR, MODULES_DIR } from './constants.ts';

/** Helpers for the JSON files of modules and pages. */

type ModuleEntry = { type: string; content: Record<string, unknown> };
export type PageContent = { seo: Record<string, string>; modules: Record<string, ModuleEntry> };

export function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
}

export function writeJson(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function updateJson<T>(filePath: string, update: (value: T) => void): void {
  const value = readJson<T>(filePath);
  update(value);
  writeJson(filePath, value);
}

export const moduleDir = (moduleName: string) => path.join(MODULES_DIR, moduleName);

export const moduleFile = (moduleName: string, file: string) => path.join(MODULES_DIR, moduleName, file);

export function assertModuleExists(moduleName: string): void {
  if (!fs.existsSync(moduleDir(moduleName))) {
    throw new Error(`Module "${moduleName}" does not exist.`);
  }
}

export type FieldKinds = Record<string, { kind: 'editable' | 'custom'; type: string }>;

export function readFieldKinds(moduleName: string): FieldKinds {
  return readJson<FieldKinds>(moduleFile(moduleName, 'fieldKinds.json'));
}

export function pageContentPath(pageSlug: string): string {
  return path.join(CONTENT_DIR, `${pageSlug}.json`);
}

export function listPageSlugs(): string[] {
  return fs
    .readdirSync(CONTENT_DIR)
    .filter((file) => file.endsWith('.json'))
    .map((file) => file.replace(/\.json$/, ''));
}

/** Applies `update` to every instance of a module type on every page. Returns the touched pages. */
export function updateModuleInstances(moduleName: string, update: (content: Record<string, unknown>) => void): string[] {
  const touched: string[] = [];
  for (const slug of listPageSlugs()) {
    const filePath = pageContentPath(slug);
    const page = readJson<PageContent>(filePath);
    const instances = Object.values(page.modules).filter((entry) => entry.type === moduleName);
    if (instances.length === 0) continue;
    instances.forEach((entry) => update(entry.content));
    writeJson(filePath, page);
    touched.push(slug);
  }

  return touched;
}

/** `instanceId on page` for every usage of a module type. */
export function findModuleUsages(moduleName: string): string[] {
  return listPageSlugs().flatMap((slug) =>
    Object.entries(readJson<PageContent>(pageContentPath(slug)).modules)
      .filter(([, entry]) => entry.type === moduleName)
      .map(([instanceId]) => `${instanceId} on ${slug}`),
  );
}
