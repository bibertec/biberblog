import fs from 'node:fs';
import {
  IndentationText,
  Node,
  Project,
  QuoteKind,
  SyntaxKind,
  type Expression,
  type FunctionDeclaration,
  type JsxElement,
  type ObjectLiteralExpression,
  type SourceFile,
} from 'ts-morph';

/**
 * Small AST toolkit (ts-morph) for the generators. Code is edited as a syntax tree instead of text,
 * so the generators work regardless of how the developer formatted the code, and fail with a clear
 * message instead of silently doing nothing when the expected structure is missing.
 */

function createProject(): Project {
  return new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    manipulationSettings: {
      quoteKind: QuoteKind.Single,
      indentationText: IndentationText.TwoSpaces,
      useTrailingCommas: true,
    },
  });
}

/** Loads a file from disk, applies `edit` and writes it back. */
export function editSourceFile(filePath: string, edit: (sourceFile: SourceFile) => void): void {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${filePath} does not exist.`);
  }
  const sourceFile = createProject().addSourceFileAtPath(filePath);
  edit(sourceFile);
  ensureBlankLineAfterImports(sourceFile);
  sourceFile.saveSync();
}

/** Removing imports with ts-morph can swallow the blank line that separates them from the code. */
function ensureBlankLineAfterImports(sourceFile: SourceFile): void {
  const lastImport = sourceFile.getImportDeclarations().at(-1);
  const next = lastImport?.getNextSibling();
  if (!lastImport || !next) return;
  const between = sourceFile.getFullText().slice(lastImport.getEnd(), next.getStart());
  const leadingWhitespace = /^\s*/.exec(between)?.[0] ?? '';
  if ((leadingWhitespace.match(/\n/g) ?? []).length < 2) {
    sourceFile.insertText(lastImport.getEnd(), '\n');
  }
}

export class CodemodError extends Error {
  constructor(sourceFile: SourceFile, message: string) {
    super(`${sourceFile.getFilePath()}: ${message} (see src/system/docs/plop.md)`);
  }
}

/** Strips `satisfies …`, `as …` and parentheses around an expression. */
function unwrap(expression: Expression): Expression {
  let current = expression;
  while (
    Node.isSatisfiesExpression(current) ||
    Node.isAsExpression(current) ||
    Node.isParenthesizedExpression(current)
  ) {
    current = current.getExpression();
  }

  return current;
}

function getInitializer(sourceFile: SourceFile, variableName: string): Expression {
  const initializer = sourceFile.getVariableDeclaration(variableName)?.getInitializer();
  if (!initializer) {
    throw new CodemodError(sourceFile, `variable "${variableName}" not found`);
  }

  return unwrap(initializer);
}

/** The object literal of `const name = { … }` or `const name = z.object({ … })`. */
export function getObjectLiteral(sourceFile: SourceFile, variableName: string): ObjectLiteralExpression {
  const initializer = getInitializer(sourceFile, variableName);
  if (Node.isObjectLiteralExpression(initializer)) return initializer;
  if (Node.isCallExpression(initializer)) {
    const [argument] = initializer.getArguments();
    if (argument && Node.isObjectLiteralExpression(argument)) return argument;
  }

  throw new CodemodError(sourceFile, `"${variableName}" is not an object literal or z.object({ … })`);
}

// --- Object properties ------------------------------------------------------------------------

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function propertyName(node: Node): string | undefined {
  if (!Node.isPropertyAssignment(node) && !Node.isShorthandPropertyAssignment(node)) return undefined;
  const nameNode = node.getNameNode();

  return Node.isStringLiteral(nameNode) ? nameNode.getLiteralText() : nameNode.getText();
}

function findProperty(object: ObjectLiteralExpression, name: string) {
  return object.getProperties().find((property) => propertyName(property) === name);
}

export function propertyNames(object: ObjectLiteralExpression): string[] {
  return object.getProperties().flatMap((property) => propertyName(property) ?? []);
}

export function hasProperty(object: ObjectLiteralExpression, name: string): boolean {
  return findProperty(object, name) !== undefined;
}

/** Adds `name: initializer` (quoting the key if needed) or replaces the initializer of an existing one. */
export function setProperty(object: ObjectLiteralExpression, name: string, initializer: string): void {
  const existing = findProperty(object, name);
  if (existing && Node.isPropertyAssignment(existing)) {
    existing.setInitializer(initializer);
    return;
  }
  existing?.remove();
  object.addPropertyAssignment({ name: IDENTIFIER.test(name) ? name : `'${name}'`, initializer });
}

export function removeProperty(object: ObjectLiteralExpression, name: string): boolean {
  const property = findProperty(object, name);
  if (!property) return false;
  keepListFormatting(object, () => property.remove(), () => object.getProperties());

  return true;
}

/**
 * ts-morph drops the trailing comma when the last property of a multi-line object is removed and
 * leaves `{\n}` behind for an emptied object. This restores the previous style.
 */
function keepListFormatting(list: ObjectLiteralExpression, remove: () => void, elements: () => Node[]): void {
  const closingToken = list.getLastChildOrThrow();
  const beforeClosing = list.getSourceFile().getFullText().slice(list.getStart(), closingToken.getStart());
  const hadTrailingComma = /,\s*$/.test(beforeClosing);
  remove();
  const remaining = elements();
  if (remaining.length === 0) {
    if (list.getText().replace(/\s/g, '') === '{}') list.replaceWithText('{}');
    return;
  }
  const last = remaining[remaining.length - 1];
  const afterLast = list.getSourceFile().getFullText().slice(last.getEnd(), list.getLastChildOrThrow().getStart());
  if (hadTrailingComma && !afterLast.trimStart().startsWith(',')) {
    list.getSourceFile().insertText(last.getEnd(), ',');
  }
}

// --- Imports ----------------------------------------------------------------------------------

export function ensureNamedImport(
  sourceFile: SourceFile,
  moduleSpecifier: string,
  name: string,
  options: { typeOnly?: boolean } = {},
): void {
  const declarations = sourceFile
    .getImportDeclarations()
    .filter((declaration) => declaration.getModuleSpecifierValue() === moduleSpecifier);
  if (declarations.some((d) => d.getNamedImports().some((specifier) => specifier.getName() === name))) return;
  const sameKind = declarations.find((d) => d.isTypeOnly() === Boolean(options.typeOnly) && !d.getNamespaceImport());
  if (sameKind) {
    sameKind.addNamedImport(name);
    return;
  }
  sourceFile.addImportDeclaration({ moduleSpecifier, namedImports: [name], isTypeOnly: options.typeOnly });
}

export function ensureDefaultImport(sourceFile: SourceFile, moduleSpecifier: string, name: string): void {
  const exists = sourceFile
    .getImportDeclarations()
    .some((d) => d.getModuleSpecifierValue() === moduleSpecifier && d.getDefaultImport()?.getText() === name);
  if (!exists) {
    sourceFile.addImportDeclaration({ moduleSpecifier, defaultImport: name });
  }
}

function isUsed(sourceFile: SourceFile, name: string): boolean {
  return sourceFile
    .getDescendantsOfKind(SyntaxKind.Identifier)
    .some((identifier) => identifier.getText() === name && !identifier.getFirstAncestorByKind(SyntaxKind.ImportDeclaration));
}

/** Removes the import of `name` (default or named) if nothing in the file uses it anymore. */
export function removeImportIfUnused(sourceFile: SourceFile, name: string): void {
  if (isUsed(sourceFile, name)) return;
  for (const declaration of sourceFile.getImportDeclarations()) {
    if (declaration.getDefaultImport()?.getText() === name) {
      declaration.removeDefaultImport();
    }
    declaration.getNamedImports().find((specifier) => specifier.getName() === name)?.remove();
    // `wasForgotten` guards against the declaration having been removed together with its last specifier.
    if (
      !declaration.wasForgotten() &&
      !declaration.getDefaultImport() &&
      declaration.getNamedImports().length === 0 &&
      !declaration.getNamespaceImport()
    ) {
      declaration.remove();
    }
  }
}

// --- Functions & statements -------------------------------------------------------------------

export function getFunction(sourceFile: SourceFile, name: string): FunctionDeclaration {
  const fn = sourceFile.getFunction(name);
  if (!fn) {
    throw new CodemodError(sourceFile, `function "${name}" not found`);
  }

  return fn;
}

export function getDefaultExportFunction(sourceFile: SourceFile): FunctionDeclaration {
  const fn = sourceFile.getFunctions().find((f) => f.isDefaultExport());
  if (!fn) {
    throw new CodemodError(sourceFile, 'no default-exported function found');
  }

  return fn;
}

/** Removes top-level declarations (variables, functions, type aliases) by name. */
export function removeDeclarations(sourceFile: SourceFile, names: string[]): void {
  for (const name of names) {
    sourceFile.getVariableStatement(name)?.remove();
    sourceFile.getFunction(name)?.remove();
    sourceFile.getTypeAlias(name)?.remove();
  }
}

// --- JSX --------------------------------------------------------------------------------------

/** The outermost JSX element returned by a function component. */
export function getReturnedJsxElement(fn: FunctionDeclaration): JsxElement {
  const returnStatement = fn.getStatements().find((statement) => Node.isReturnStatement(statement));
  const expression = returnStatement && Node.isReturnStatement(returnStatement) ? returnStatement.getExpression() : undefined;
  const jsx = expression ? unwrap(expression) : undefined;
  if (!jsx || !Node.isJsxElement(jsx)) {
    throw new CodemodError(fn.getSourceFile(), `"${fn.getName() ?? 'default export'}" does not return a JSX element`);
  }

  return jsx;
}

function lineIndentation(sourceFile: SourceFile, position: number): string {
  const text = sourceFile.getFullText();
  const lineStart = text.lastIndexOf('\n', position - 1) + 1;

  return /^[ \t]*/.exec(text.slice(lineStart))?.[0] ?? '';
}

/**
 * Inserts a JSX line into `container`. An optional placement comment inside the container (a JSX
 * comment containing e.g. `PLOP_INJECT_FIELD`) decides where; without it, the line is appended as
 * the last child.
 */
export function insertJsxChild(container: JsxElement, jsx: string, placementComment: string): void {
  const sourceFile = container.getSourceFile();
  const placeholder = container
    .getDescendantsOfKind(SyntaxKind.JsxExpression)
    .find((expression) => expression.getExpression() === undefined && expression.getText().includes(placementComment));
  if (placeholder) {
    const indentation = lineIndentation(sourceFile, placeholder.getStart());
    sourceFile.insertText(placeholder.getStart(), `${jsx}\n${indentation}`);
    return;
  }
  const closing = container.getClosingElement();
  const closingIndentation = lineIndentation(sourceFile, closing.getStart());
  const text = sourceFile.getFullText();
  const lineStart = text.lastIndexOf('\n', closing.getStart() - 1) + 1;
  const closingOnOwnLine = text.slice(lineStart, closing.getStart()).trim() === '';
  const childIndentation = `${closingIndentation}  `;
  if (closingOnOwnLine) {
    sourceFile.insertText(lineStart, `${childIndentation}${jsx}\n`);
  } else {
    sourceFile.insertText(closing.getStart(), `\n${childIndentation}${jsx}\n${closingIndentation}`);
  }
}

/** Removes a node together with its line if it stands alone on that line. */
export function removeNodeWithLine(node: Node): void {
  const sourceFile = node.getSourceFile();
  const text = sourceFile.getFullText();
  let start = node.getStart();
  let end = node.getEnd();
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = text.indexOf('\n', end);
  const aloneOnLine =
    text.slice(lineStart, start).trim() === '' && text.slice(end, lineEnd === -1 ? text.length : lineEnd).trim() === '';
  if (aloneOnLine) {
    start = lineStart;
    end = lineEnd === -1 ? text.length : lineEnd + 1;
  }
  sourceFile.removeText(start, end);
}

/** JSX elements (self-closing or not) with an attribute whose initializer text matches `test`. */
export function findJsxElementsByAttribute(
  root: Node,
  attributeName: string,
  test: (initializerText: string) => boolean,
): Node[] {
  const matches: Node[] = [];
  for (const kind of [SyntaxKind.JsxSelfClosingElement, SyntaxKind.JsxOpeningElement] as const) {
    for (const element of root.getDescendantsOfKind(kind)) {
      const attribute = element.getAttribute(attributeName);
      const initializer = attribute && Node.isJsxAttribute(attribute) ? attribute.getInitializer() : undefined;
      if (initializer && test(initializer.getText())) {
        matches.push(Node.isJsxOpeningElement(element) ? element.getParentOrThrow() : element);
      }
    }
  }

  return matches;
}
