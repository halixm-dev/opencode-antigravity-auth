import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, extname, join, resolve } from "node:path"
import ts from "typescript"

// tsc preserves the project's extensionless imports. Published ESM needs explicit
// extensions when loaded by Node, including declarations consumed with NodeNext.
function visit(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      visit(path)
      continue
    }
    if (!entry.name.endsWith(".js") && !entry.name.endsWith(".d.ts")) continue
    const original = readFileSync(path, "utf8")
    const source = ts.createSourceFile(path, original, ts.ScriptTarget.Latest, true)
    const replacements = []
    const inspect = (node) => {
      const literal = ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
        ? node.moduleSpecifier
        : ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)
          ? node.argument.literal
        : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
          ? node.arguments[0]
          : undefined
      if (!literal || !ts.isStringLiteral(literal) || !literal.text.startsWith(".") || extname(literal.text)) {
        ts.forEachChild(node, inspect)
        return
      }
      const specifier = literal.text
      const target = resolve(dirname(path), specifier)
      const replacement = existsSync(`${target}.js`) ? `${specifier}.js`
        : existsSync(join(target, "index.js")) ? `${specifier}/index.js`
          : undefined
      if (!replacement) throw new Error(`Cannot resolve published ESM import ${specifier} in ${path}`)
      replacements.push({ start: literal.getStart(source) + 1, end: literal.getEnd() - 1, replacement })
      ts.forEachChild(node, inspect)
    }
    inspect(source)
    let updated = original
    for (const edit of replacements.sort((a, b) => b.start - a.start)) {
      updated = updated.slice(0, edit.start) + edit.replacement + updated.slice(edit.end)
    }
    if (updated !== original) writeFileSync(path, updated)
  }
}

visit(resolve(process.argv[2] ?? "dist"))
