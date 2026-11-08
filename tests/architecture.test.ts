import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";

const root = resolve(import.meta.dirname, "..");
function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.[cm]?tsx?$/.test(path) && !path.endsWith(".test.ts")
      ? [path]
      : [];
  });
}
function runtimeImports(file: string): string[] {
  const result: string[] = [];
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  function visit(node: ts.Node) {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const clause = node.importClause;
      const named = clause?.namedBindings;
      const onlyNamedTypes =
        !clause?.name &&
        named &&
        ts.isNamedImports(named) &&
        named.elements.length > 0 &&
        named.elements.every((item) => item.isTypeOnly);
      if (!clause?.isTypeOnly && !onlyNamedTypes)
        result.push(node.moduleSpecifier.text);
    }
    if (
      ts.isExportDeclaration(node) &&
      !node.isTypeOnly &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      result.push(node.moduleSpecifier.text);
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    )
      result.push(node.arguments[0].text);
    ts.forEachChild(node, visit);
  }
  visit(source);
  return result;
}
function resolveModule(file: string, specifier: string): string | undefined {
  if (!specifier.startsWith(".")) return undefined;
  const base = resolve(dirname(file), specifier);
  return [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ].find((path) => existsSync(path) && /\.[cm]?tsx?$/.test(path));
}

test("frontend runtime import graph cannot reach worker, server, or approval business rules", () => {
  const pending = [
    ...sourceFiles(join(root, "apps/web/src")),
    ...sourceFiles(join(root, "packages/client")),
  ];
  const visited = new Set<string>();
  const violations: string[] = [];
  while (pending.length) {
    const file = pending.pop()!;
    if (visited.has(file)) continue;
    visited.add(file);
    for (const specifier of runtimeImports(file)) {
      if (specifier.startsWith("node:") || specifier === "spacetimedb/server")
        violations.push(`${relative(root, file)} imports ${specifier}`);
      const target = resolveModule(file, specifier);
      if (!target) continue;
      const path = relative(root, target).replaceAll("\\", "/");
      if (
        /^(services|spacetime)\//.test(path) ||
        path === "packages/contracts/review.ts"
      ) {
        violations.push(`${relative(root, file)} imports ${path}`);
      } else pending.push(target);
    }
  }
  assert.deepEqual(
    violations,
    [],
    "UI may display confirmed decisions and supplied expectations, but cannot import execution, provider credentials, or approval policy",
  );
});
