import fs from 'node:fs';
import path from 'node:path';
import type { NodePlopAPI } from 'plop';
import { MODULES_DIR, CONTENT_DIR } from '../constants.ts';

export function registerModuleRemoveGenerator(plop: NodePlopAPI) {
  plop.setGenerator('module:remove', {
    description: 'Removes a module completely',
    prompts: async (inquirer) => {
      const availableModules = fs
        .readdirSync(MODULES_DIR)
        .filter((entry) => fs.statSync(path.join(MODULES_DIR, entry)).isDirectory());

      const { moduleName } = await inquirer.prompt([
        {
          type: 'list',
          name: 'moduleName',
          message: 'Which module should be removed completely?',
          choices: availableModules,
        },
      ]);

      const pageFiles = fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.json'));
      const usages: string[] = [];

      for (const pageFile of pageFiles) {
        const contentPath = path.join(CONTENT_DIR, pageFile);
        const content = JSON.parse(fs.readFileSync(contentPath, 'utf-8'));

        for (const [instanceId, moduleEntry] of Object.entries(content.modules) as [
          string,
          { type: string },
        ][]) {
          if (moduleEntry.type === moduleName) {
            usages.push(`${instanceId} on ${pageFile.replace(/\.json$/, '')}`);
          }
        }
      }

      if (usages.length > 0) {
        throw new Error(
          `Module "${moduleName}" is still in use: ${usages.join(', ')}. Please remove it with page:remove-module first.`
        );
      }

      return { moduleName };
    },
    actions: [{ type: 'removeModule' }],
  });
}
