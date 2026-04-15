import * as fs from "fs";
import * as path from "path";
import { DEFAULT_PROJECT_CONFIG, ProjectConfig } from "./types.js";

export const CONFIG_FILE_NAME = "node-excellent-migrations.config.json";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeArrayOfStrings(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((entry): entry is string => typeof entry === "string");
}

function mergeProjectConfig(raw: unknown): ProjectConfig {
  if (!isPlainObject(raw)) {
    throw new Error("Config file must contain a JSON object.");
  }

  const skipChecks = normalizeArrayOfStrings(raw.skipChecks);
  const severityOverrides = isPlainObject(raw.severityOverrides)
    ? raw.severityOverrides
    : undefined;

  return {
    ...DEFAULT_PROJECT_CONFIG,
    ...raw,
    ...(skipChecks ? { skipChecks: skipChecks as ProjectConfig["skipChecks"] } : {}),
    ...(severityOverrides ? {
      severityOverrides: severityOverrides as ProjectConfig["severityOverrides"],
    } : {}),
  };
}

export function findConfigFile(startDir = process.cwd()): string | null {
  let currentDir = path.resolve(startDir);

  while (true) {
    const candidate = path.join(currentDir, CONFIG_FILE_NAME);
    if (fs.existsSync(candidate)) {
      return candidate;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }
    currentDir = parentDir;
  }
}

export function loadProjectConfig(configPath?: string): {
  path: string | null;
  config: ProjectConfig;
} {
  const resolvedConfigPath = configPath
    ? path.resolve(configPath)
    : findConfigFile();

  if (!resolvedConfigPath) {
    return {
      path: null,
      config: { ...DEFAULT_PROJECT_CONFIG },
    };
  }

  const raw = JSON.parse(fs.readFileSync(resolvedConfigPath, "utf8")) as unknown;
  return {
    path: resolvedConfigPath,
    config: mergeProjectConfig(raw),
  };
}

export function resolveFromConfig(baseDir: string, relativePath: string): string {
  return path.resolve(baseDir, relativePath);
}

export function getConfigBaseDir(configPath: string | null, cwd = process.cwd()): string {
  return configPath ? path.dirname(configPath) : cwd;
}

export function createDefaultConfigFileContents(): string {
  return `${JSON.stringify(DEFAULT_PROJECT_CONFIG, null, 2)}\n`;
}
