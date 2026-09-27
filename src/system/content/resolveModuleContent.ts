import { z } from 'zod';
import { moduleRegistry } from '@/src/generated/moduleRegistry';
import type { PageContent } from './pageContentSchema';
import type { ModuleRegistryEntry } from './registryTypes';

export function resolveModuleContent<T extends keyof typeof moduleRegistry>(
  page: PageContent,
  id: string,
  type: T
): z.infer<(typeof moduleRegistry)[T]['schema']> {
  const moduleEntry = page.modules[id];
  if (!moduleEntry || moduleEntry.type !== type) {
    throw new Error(`Module "${id}" is missing or has the wrong type (expected: ${type})`);
  }

  const registry = moduleRegistry as Record<string, ModuleRegistryEntry>;
  return registry[type as string].schema.parse(moduleEntry.content) as z.infer<
    (typeof moduleRegistry)[T]['schema']
  >;
}
