import fs from 'node:fs';
import path from 'node:path';
import type { NodePlopAPI } from 'plop';
import { KEBAB_CASE_PATTERN, CONTENT_DIR, templatePath } from '../constants.ts';
import { defaultPageLabel } from '../names.ts';

export function registerPageAddGenerator(plop: NodePlopAPI) {
  plop.setGenerator('page:add', {
    description: 'Creates a new page (content JSON + page file)',
    prompts: async (inquirer) => {
      const { pageSlug } = await inquirer.prompt([
        {
          type: 'input',
          name: 'pageSlug',
          message: 'What should the page be called? (kebab-case, e.g. about-us)',
          validate: (input: string) => {
            if (!KEBAB_CASE_PATTERN.test(input)) {
              return 'Slug must be kebab-case (e.g. "about-us", "services") — lowercase letters, digits and hyphens only.';
            }
            if (fs.existsSync(path.join(CONTENT_DIR, `${input}.json`))) {
              return `A page with slug "${input}" already exists.`;
            }
            return true;
          },
        },
      ]);
      const { label } = await inquirer.prompt([
        {
          type: 'input',
          name: 'label',
          message: 'Label of the page in the editor (e.g. in the link dialog)?',
          default: defaultPageLabel(pageSlug),
          validate: (input: string) => input.trim() !== '' || 'Please enter a label.',
        },
      ]);

      return { pageSlug, label: label.trim() };
    },
    actions: [
      { type: 'validateNewPage' },
      {
        type: 'add',
        path: 'src/project/content/{{pageSlug}}.json',
        templateFile: templatePath('page/content.json.hbs'),
      },
      {
        type: 'add',
        path: '{{pagePath pageSlug}}',
        templateFile: templatePath('page/page.tsx.hbs'),
      },
      { type: 'registerPage' },
    ],
  });
}
