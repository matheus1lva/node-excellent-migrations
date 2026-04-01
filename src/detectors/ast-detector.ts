import * as ts from "typescript";
import { Danger, DangerType, DANGER_MESSAGES } from "../types";
import { detectSqlDangers, detectBackfillDanger } from "./sql-detector";

/**
 * Extracts all string literals and template literals from a JS/TS source file.
 * Returns them with their line numbers so SQL analysis can map back to the source.
 */
interface ExtractedString {
  value: string;
  line: number;
}

function extractStrings(sourceFile: ts.SourceFile): ExtractedString[] {
  const strings: ExtractedString[] = [];

  function visit(node: ts.Node): void {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const line =
        sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      strings.push({ value: node.text, line });
    } else if (ts.isTemplateExpression(node)) {
      // Combine template parts into a single string for analysis
      let combined = node.head.text;
      for (const span of node.templateSpans) {
        combined += "EXPR" + span.literal.text;
      }
      const line =
        sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      strings.push({ value: combined, line });
    } else if (ts.isTaggedTemplateExpression(node)) {
      // Handle tagged templates like sql`...`
      const template = node.template;
      if (ts.isNoSubstitutionTemplateLiteral(template)) {
        const line =
          sourceFile.getLineAndCharacterOfPosition(template.getStart()).line + 1;
        strings.push({ value: template.text, line });
      } else if (ts.isTemplateExpression(template)) {
        let combined = template.head.text;
        for (const span of template.templateSpans) {
          combined += "EXPR" + span.literal.text;
        }
        const line =
          sourceFile.getLineAndCharacterOfPosition(template.getStart()).line + 1;
        strings.push({ value: combined, line });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return strings;
}

/**
 * Detects if a string looks like SQL (contains SQL keywords).
 */
function looksLikeSql(str: string): boolean {
  const sqlKeywords =
    /\b(ALTER\s+TABLE|CREATE\s+TABLE|DROP\s+TABLE|CREATE\s+INDEX|INSERT\s+INTO|UPDATE\s+\S+\s+SET|DELETE\s+FROM|ADD\s+COLUMN|DROP\s+COLUMN|RENAME\s+COLUMN|ADD\s+CONSTRAINT|FOREIGN\s+KEY)\b/i;
  return sqlKeywords.test(str);
}

/**
 * Analyzes a JS/TS migration file by extracting SQL strings and analyzing them.
 * This is framework-agnostic — works with any migration tool (Knex, TypeORM, Sequelize, etc.)
 */
export function detectAstDangers(
  source: string,
  fileName: string
): Danger[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS
  );

  const extracted = extractStrings(sourceFile);
  const dangers: Danger[] = [];

  // Collect all SQL strings for backfill detection (cross-string analysis)
  let allSql = "";

  for (const { value, line } of extracted) {
    if (!looksLikeSql(value)) continue;

    allSql += "\n" + value;

    const sqlDangers = detectSqlDangers(value);
    for (const danger of sqlDangers) {
      dangers.push({
        ...danger,
        // Adjust line to the source file line where the string starts
        line: line + (danger.line ? danger.line - 1 : 0),
      });
    }
  }

  // Check for backfill in same transaction across all SQL strings in the file
  if (allSql) {
    const backfillDangers = detectBackfillDanger(allSql);
    for (const d of backfillDangers) {
      dangers.push({ ...d, line: undefined });
    }
  }

  // Also flag any raw SQL execution calls (framework-agnostic detection)
  detectRawSqlCalls(sourceFile, dangers);

  return dangers;
}

/**
 * Detects calls that execute raw SQL (e.g., .raw(), .query(), .execute(), knex.raw(), etc.)
 */
function detectRawSqlCalls(sourceFile: ts.SourceFile, dangers: Danger[]): void {
  const rawSqlMethods = new Set([
    "raw",
    "rawQuery",
    "sequelize.query",
    "executeQuery",
  ]);

  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression)
    ) {
      const methodName = node.expression.name.text;
      if (rawSqlMethods.has(methodName)) {
        const line =
          sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        dangers.push({
          type: DangerType.RAW_SQL_EXECUTED,
          message: DANGER_MESSAGES[DangerType.RAW_SQL_EXECUTED],
          line,
          snippet: node.getText(sourceFile).substring(0, 120),
        });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}
