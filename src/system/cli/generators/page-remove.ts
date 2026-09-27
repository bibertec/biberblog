import fs from 'node:fs';
import path from 'node:path';
import type { NodePlopAPI } from 'plop';

export function registerPageRemoveGenerator(plop: NodePlopAPI) {
  plop.setGenerator('page:remove', {
    description: 'Removes a page completely',
    prompts: async (inquirer) => {
      const availablePages = fs
        .readdirSync(path.join(process.cwd(), 'src/project/content'))
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace(/\.json$/, ''))
        .filter((slug) => slug !== 'home');

      if (availablePages.length === 0) {
        throw new Error('There is no removable page other than "home".');
      }

      const { pageSlug } = await inquirer.prompt([
        {
          type: 'list',
          name: 'pageSlug',
          message: 'Which page should be removed?',
          choices: availablePages,
        },
      ]);

      return { pageSlug };
    },
    actions: [{ type: 'removePage' }],
  });
}
