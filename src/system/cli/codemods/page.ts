import { SyntaxKind } from 'ts-morph';
import {
  editSourceFile,
  ensureDefaultImport,
  ensureNamedImport,
  findJsxElementsByAttribute,
  getDefaultExportFunction,
  getReturnedJsxElement,
  insertJsxChild,
  readSourceFile,
  removeImportIfUnused,
  removeNodeWithLine,
} from '../ast.ts';
import { pageContentVarFor, pagePathFor } from '../names.ts';

const RESOLVE_MODULE_CONTENT_IMPORT = '@/src/system/content/resolveModuleContent';

const idMatcher = (instanceId: string) => (initializerText: string) =>
  initializerText.replace(/^\{?\s*['"`]|['"`]\s*\}?$/g, '') === instanceId;

export function addModuleToPage(pageSlug: string, instanceId: string, moduleType: string): void {
  editSourceFile(pagePathFor(pageSlug), (sourceFile) => {
    const contentVar = pageContentVarFor(pageSlug);
    ensureDefaultImport(sourceFile, `@/src/project/content/${pageSlug}.json`, contentVar);
    ensureNamedImport(sourceFile, RESOLVE_MODULE_CONTENT_IMPORT, 'resolveModuleContent');
    ensureNamedImport(sourceFile, `@/src/project/components/modules/${moduleType}/${moduleType}`, moduleType);
    const root = getReturnedJsxElement(getDefaultExportFunction(sourceFile));
    // Modules go into <main> if there is one, otherwise into the outermost element.
    const container =
      root.getOpeningElement().getTagNameNode().getText() === 'main'
        ? root
        : (root.getDescendantsOfKind(SyntaxKind.JsxElement).find((element) => element.getOpeningElement().getTagNameNode().getText() === 'main') ?? root);
    insertJsxChild(
      container,
      `<${moduleType} id="${instanceId}" content={resolveModuleContent(${contentVar}, '${instanceId}', '${moduleType}')} />`,
      'PLOP_INJECT_MODULE',
    );
  });
}

/**
 * The instance ids the page file renders, in render order (the developer may have reordered them).
 * Ids that are only left in the content JSON are dropped.
 */
export function renderedInOrder(pageSlug: string, instanceIds: string[]): string[] {
  const page = getDefaultExportFunction(readSourceFile(pagePathFor(pageSlug)));
  const positions = new Map(
    instanceIds.flatMap((instanceId) => {
      const [element] = findJsxElementsByAttribute(page, 'id', idMatcher(instanceId));
      return element ? [[instanceId, element.getStart()] as const] : [];
    }),
  );

  return [...positions.keys()].sort((a, b) => positions.get(a)! - positions.get(b)!);
}

export function removeModuleFromPage(pageSlug: string, instanceId: string, moduleType: string): void {
  editSourceFile(pagePathFor(pageSlug), (sourceFile) => {
    for (;;) {
      const [element] = findJsxElementsByAttribute(getDefaultExportFunction(sourceFile), 'id', idMatcher(instanceId));
      if (!element) break;
      removeNodeWithLine(element);
    }
    // Content imports are only needed while the page renders at least one module.
    for (const name of [moduleType, 'resolveModuleContent', pageContentVarFor(pageSlug)]) {
      removeImportIfUnused(sourceFile, name);
    }
  });
}
