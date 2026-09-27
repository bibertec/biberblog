import fs from 'node:fs';
import path from 'node:path';
import type { NodePlopAPI } from 'plop';
import { KEBAB_CASE_PATTERN } from '../constants.ts';
import { pageContentPath } from '../content.ts';
import { generate } from '../generate.ts';
import { assertPattern } from '../validation.ts';

export function registerPageActions(plop: NodePlopAPI) {
  plop.setActionType('validateNewPage', async (answers) => {
    const { pageSlug, label } = answers as { pageSlug: string; label?: unknown };
    assertPattern(pageSlug, KEBAB_CASE_PATTERN, `Slug "${pageSlug}" must be kebab-case.`);
    if (label !== undefined && (typeof label !== 'string' || label.trim() === '')) {
      throw new Error('The page label must not be empty.');
    }
    if (fs.existsSync(pageContentPath(pageSlug))) {
      throw new Error(`A page with slug "${pageSlug}" already exists.`);
    }

    return `Page "${pageSlug}" is valid`;
  });

  plop.setActionType('registerPage', async (answers) => {
    const { pageSlug } = answers as { pageSlug: string };
    generate();

    return `Page "${pageSlug}" registered (src/generated/ updated)`;
  });

  plop.setActionType('removePage', async (answers) => {
    const { pageSlug } = answers as { pageSlug: string };
    if (pageSlug === 'home') {
      throw new Error('The home page cannot be removed.');
    }
    const contentPath = pageContentPath(pageSlug);
    if (!fs.existsSync(contentPath)) {
      throw new Error(`Page "${pageSlug}" does not exist.`);
    }
    fs.unlinkSync(contentPath);
    fs.rmSync(path.join('app', pageSlug), { recursive: true, force: true });
    generate();

    return `Page "${pageSlug}" removed`;
  });
}
