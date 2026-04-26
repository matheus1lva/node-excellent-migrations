import { DangerType } from "node-excellent-migrations";
import {
  createDangerRule,
  noDangerousMigrationRule,
} from "./rules/no-dangerous-migration.js";

function ruleNameForDangerType(type: DangerType): string {
  return `no-${type}`;
}

const typedRules = Object.fromEntries(
  Object.values(DangerType).map((type) => [ruleNameForDangerType(type), createDangerRule(type)])
);

export const rules = {
  "no-dangerous-migration": noDangerousMigrationRule,
  ...typedRules,
};

export const configs = {
  recommended: {
    plugins: ["node-excellent-migrations"],
    rules: {
      "node-excellent-migrations/no-dangerous-migration": "error",
    },
  },
};

const plugin = {
  rules,
  configs,
};

export default plugin;
