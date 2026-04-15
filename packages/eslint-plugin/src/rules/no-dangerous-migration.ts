import {
  analyzeSource,
  Config,
  DangerType,
} from "../../../core/dist/index.js";
import { RuleModule } from "../types.js";

interface RuleOptions {
  skipChecks?: DangerType[];
  errorOn?: DangerType[];
  startAfter?: string;
}

function toConfig(options: RuleOptions | undefined): Partial<Config> {
  const config: Partial<Config> = {};

  if (options?.skipChecks) {
    config.skipChecks = options.skipChecks;
  }
  if (options?.startAfter) {
    config.startAfter = options.startAfter;
  }
  if (options?.errorOn?.length) {
    config.severityOverrides = Object.fromEntries(
      options.errorOn.map((type) => [type, "error"])
    ) as Config["severityOverrides"];
  }

  return config;
}

function formatRuleName(type?: DangerType): string {
  return type ? `dangerous ${type.replace(/_/g, " ")}` : "dangerous migration operations";
}

export function createDangerRule(filterType?: DangerType): RuleModule {
  return {
    meta: {
      type: "problem",
      docs: {
        description: `Detect ${formatRuleName(filterType)} in migration files`,
        recommended: !filterType,
      },
      schema: [
        {
          type: "object",
          properties: {
            skipChecks: {
              type: "array",
              items: { type: "string" },
            },
            errorOn: {
              type: "array",
              items: { type: "string" },
            },
            startAfter: {
              type: "string",
            },
          },
          additionalProperties: false,
        },
      ],
    },
    create(context) {
      return {
        Program(node) {
          const fileName = context.getFilename();
          const source = context.getSourceCode().text;
          const config = toConfig(context.options[0] as RuleOptions | undefined);
          const result = analyzeSource(source, { fileName, config });

          for (const danger of result.dangers) {
            if (filterType && danger.type !== filterType) {
              continue;
            }

            const line = danger.line ?? node.loc?.start.line ?? 1;
            context.report({
              loc: {
                start: { line, column: 0 },
                end: { line, column: 1 },
              },
              message: `[${danger.type}] ${danger.message}`,
            });
          }
        },
      };
    },
  };
}

export const noDangerousMigrationRule = createDangerRule();
