import { AnalysisResult, DangerSeverity, DangerType, Config, DEFAULT_CONFIG } from "./types";

interface ReportOptions {
  /** Use ANSI colors in output (default: true) */
  colors?: boolean;
  /** Configuration for severity overrides */
  config?: Partial<Config>;
}

const SEVERITY_COLORS = {
  warning: "\x1b[33m", // yellow
  error: "\x1b[31m",   // red
};
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

function getSeverity(
  type: DangerType,
  config: Partial<Config>
): DangerSeverity {
  return config.severityOverrides?.[type] ?? "warning";
}

/**
 * Formats analysis results as a human-readable string for terminal output.
 */
export function formatReport(
  results: AnalysisResult[],
  options: ReportOptions = {}
): string {
  const { colors = true, config = DEFAULT_CONFIG } = options;

  if (results.length === 0) {
    return colors
      ? `\x1b[32m✓ No dangerous operations detected.\x1b[0m`
      : "✓ No dangerous operations detected.";
  }

  const lines: string[] = [];
  let warningCount = 0;
  let errorCount = 0;

  for (const result of results) {
    lines.push(
      colors
        ? `\n${BOLD}${result.filePath}${RESET}`
        : `\n${result.filePath}`
    );

    for (const danger of result.dangers) {
      const severity = getSeverity(danger.type, config);
      if (severity === "error") errorCount++;
      else warningCount++;

      const prefix = severity === "error" ? "✗" : "⚠";
      const location = danger.line ? `:${danger.line}` : "";

      if (colors) {
        const color = SEVERITY_COLORS[severity];
        lines.push(
          `  ${color}${prefix}${RESET} ${DIM}[${danger.type}]${RESET}${location} ${danger.message}`
        );
      } else {
        lines.push(
          `  ${prefix} [${danger.type}]${location} ${danger.message}`
        );
      }

      if (danger.snippet) {
        lines.push(
          colors
            ? `    ${DIM}→ ${danger.snippet}${RESET}`
            : `    → ${danger.snippet}`
        );
      }
    }
  }

  lines.push("");
  const summary = `Found ${warningCount} warning(s) and ${errorCount} error(s) across ${results.length} file(s).`;
  lines.push(
    colors
      ? `${BOLD}${errorCount > 0 ? SEVERITY_COLORS.error : SEVERITY_COLORS.warning}${summary}${RESET}`
      : summary
  );

  return lines.join("\n");
}

/**
 * Returns true if any result contains a danger marked as "error" severity.
 */
export function hasErrors(
  results: AnalysisResult[],
  config: Partial<Config> = {}
): boolean {
  for (const result of results) {
    for (const danger of result.dangers) {
      if (getSeverity(danger.type, config) === "error") {
        return true;
      }
    }
  }
  return false;
}
