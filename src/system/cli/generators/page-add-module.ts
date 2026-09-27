import fs from 'node:fs';
import path from 'node:path';
import type { NodePlopAPI } from 'plop';
import { MODULES_DIR } from '../constants.ts';

export function registerPageAddModuleGenerator(plop: NodePlopAPI) {
  plop.setGenerator('page:add-module', {
    description: 'Adds an existing module to a page',
    prompts: async (inquirer) => {
      const availablePages = fs
        .readdirSync(path.join(process.cwd(), 'src/project/content'))
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace(/\.json$/, ''));

      const availableModules = fs
        .readdirSync(MODULES_DIR)
        .filter((entry) => fs.statSync(path.join(MODULES_DIR, entry)).isDirectory());

      const { pageSlug } = await inquirer.prompt([
        {
          type: 'list',
          name: 'pageSlug',
          message: 'Which page should the module be added to?',
          choices: availablePages,
        },
      ]);

      const modulesToAdd: string[] = [];

      while (true) {
        const { moduleType } = await inquirer.prompt([
          {
            type: 'list',
            name: 'moduleType',
            message: 'Which module do you want to add?',
            choices: availableModules,
          },
        ]);
        modulesToAdd.push(moduleType);

        const { action } = await inquirer.prompt([
          {
            type: 'list',
            name: 'action',
            message: 'What would you like to do?',
            choices: ['Add another module', 'Done'],
          },
        ]);

        if (action === 'Done') break;
      }

      return { pageSlug, modulesToAdd };
    },
    actions: [{ type: 'addModulesToPage' }],
  });
}
