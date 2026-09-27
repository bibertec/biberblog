import fs from 'node:fs';
import path from 'node:path';
import type { NodePlopAPI } from 'plop';
import { CONTENT_DIR } from '../constants.ts';

export function registerPageRemoveModuleGenerator(plop: NodePlopAPI) {
  plop.setGenerator('page:remove-module', {
    description: 'Removes a module instance from a page',
    prompts: async (inquirer) => {
      const availablePages = fs
        .readdirSync(path.join(process.cwd(), 'src/project/content'))
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace(/\.json$/, ''));

      const { pageSlug } = await inquirer.prompt([
        {
          type: 'list',
          name: 'pageSlug',
          message: 'Which page should a module be removed from?',
          choices: availablePages,
        },
      ]);

      const contentPath = path.join(CONTENT_DIR, `${pageSlug}.json`);
      const content = JSON.parse(fs.readFileSync(contentPath, 'utf-8'));

      const moduleChoices = Object.entries(content.modules).map(([id, mod]) => ({
        name: `${id} (${(mod as { type: string }).type})`,
        value: id,
      }));

      const { instanceIdToRemove } = await inquirer.prompt([
        {
          type: 'list',
          name: 'instanceIdToRemove',
          message: 'Which module instance do you want to remove?',
          choices: moduleChoices,
        },
      ]);

      return { pageSlug, instanceIdToRemove };
    },
    actions: [{ type: 'removeModuleFromPage' }],
  });
}
