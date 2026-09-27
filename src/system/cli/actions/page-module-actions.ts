import fs from 'node:fs';
import type { NodePlopAPI } from 'plop';
import { addModuleToPage, removeModuleFromPage } from '../codemods/page.ts';
import { assertModuleExists, moduleFile, pageContentPath, readJson, updateJson, type PageContent } from '../content.ts';

function assertPageExists(pageSlug: string): void {
  if (!fs.existsSync(pageContentPath(pageSlug))) {
    throw new Error(`Page "${pageSlug}" does not exist.`);
  }
}

/** Instance ids follow `lowercase(module type) + number`, unique per page. */
function nextInstanceId(moduleType: string, usedIds: string[]): string {
  const prefix = moduleType.toLowerCase();
  const pattern = new RegExp(`^${prefix}(\\d+)$`);
  const numbers = usedIds.map((id) => pattern.exec(id)).filter((match) => match !== null).map((match) => Number(match[1]));

  return `${prefix}${numbers.length > 0 ? Math.max(...numbers) + 1 : 1}`;
}

export function registerPageModuleActions(plop: NodePlopAPI) {
  plop.setActionType('addModulesToPage', async (answers) => {
    const { pageSlug, modulesToAdd } = answers as { pageSlug: string; modulesToAdd: string[] };
    assertPageExists(pageSlug);
    modulesToAdd.forEach(assertModuleExists);

    const added: { instanceId: string; moduleType: string }[] = [];
    updateJson<PageContent>(pageContentPath(pageSlug), (page) => {
      for (const moduleType of modulesToAdd) {
        const instanceId = nextInstanceId(moduleType, Object.keys(page.modules));
        page.modules[instanceId] = {
          type: moduleType,
          content: readJson<Record<string, unknown>>(moduleFile(moduleType, 'defaultContent.json')),
        };
        added.push({ instanceId, moduleType });
      }
    });
    added.forEach(({ instanceId, moduleType }) => addModuleToPage(pageSlug, instanceId, moduleType));

    return `${added.map(({ instanceId }) => instanceId).join(', ')} added to "${pageSlug}"`;
  });

  plop.setActionType('removeModuleFromPage', async (answers) => {
    const { pageSlug, instanceIdToRemove } = answers as { pageSlug: string; instanceIdToRemove: string };
    assertPageExists(pageSlug);
    let moduleType = '';
    updateJson<PageContent>(pageContentPath(pageSlug), (page) => {
      const entry = page.modules[instanceIdToRemove];
      if (!entry) {
        throw new Error(`Instance "${instanceIdToRemove}" does not exist on "${pageSlug}".`);
      }
      moduleType = entry.type;
      delete page.modules[instanceIdToRemove];
    });
    removeModuleFromPage(pageSlug, instanceIdToRemove, moduleType);

    return `${instanceIdToRemove} (${moduleType}) removed from "${pageSlug}"`;
  });
}
