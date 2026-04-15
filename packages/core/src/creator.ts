import * as fs from "fs";
import * as path from "path";
import {
  DEFAULT_PROJECT_CONFIG,
  MigrationExtension,
  ProjectConfig,
} from "./types.js";
import {
  CONFIG_FILE_NAME,
  createDefaultConfigFileContents,
} from "./config.js";

export interface CreateMigrationOptions {
  migrationsDir: string;
  name: string;
  extension?: MigrationExtension;
  now?: Date;
}

export interface CreateMigrationResult {
  filePath: string;
  fileName: string;
}

export interface InitProjectOptions {
  cwd?: string;
  force?: boolean;
  config?: Partial<ProjectConfig>;
}

export interface InitProjectResult {
  configPath: string;
  migrationsDir: string;
  createdConfig: boolean;
  createdMigrationsDir: boolean;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatMigrationTimestamp(now = new Date()): string {
  return [
    now.getUTCFullYear(),
    pad(now.getUTCMonth() + 1),
    pad(now.getUTCDate()),
    pad(now.getUTCHours()),
    pad(now.getUTCMinutes()),
    pad(now.getUTCSeconds()),
  ].join("");
}

export function slugifyMigrationName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");

  if (!slug) {
    throw new Error("Migration name must contain letters or numbers.");
  }

  return slug;
}

function getMigrationTemplate(extension: MigrationExtension): string {
  if (extension === ".ts") {
    return `import type { Migration } from "node-excellent-migrations";

export const up: Migration["up"] = async (client) => {
  await client.query("");
};

export const down: Migration["down"] = async (client) => {
  await client.query("");
};
`;
  }

  if (extension === ".cjs") {
    return `exports.up = async (client) => {
  await client.query("");
};

exports.down = async (client) => {
  await client.query("");
};
`;
  }

  return `export const up = async (client) => {
  await client.query("");
};

export const down = async (client) => {
  await client.query("");
};
`;
}

export function createMigration(options: CreateMigrationOptions): CreateMigrationResult {
  const extension = options.extension ?? DEFAULT_PROJECT_CONFIG.migrationExtension ?? ".mjs";
  const migrationsDir = path.resolve(options.migrationsDir);

  fs.mkdirSync(migrationsDir, { recursive: true });

  const fileName = `${formatMigrationTimestamp(options.now)}_${slugifyMigrationName(options.name)}${extension}`;
  const filePath = path.join(migrationsDir, fileName);

  if (fs.existsSync(filePath)) {
    throw new Error(`Migration already exists: ${filePath}`);
  }

  fs.writeFileSync(filePath, getMigrationTemplate(extension), "utf8");

  return {
    filePath,
    fileName,
  };
}

export function initProject(options: InitProjectOptions = {}): InitProjectResult {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const configPath = path.join(cwd, CONFIG_FILE_NAME);
  const config: ProjectConfig = {
    ...DEFAULT_PROJECT_CONFIG,
    ...options.config,
  };
  const migrationsDir = path.resolve(
    cwd,
    config.migrationsDir ?? DEFAULT_PROJECT_CONFIG.migrationsDir ?? "./migrations"
  );

  const configExists = fs.existsSync(configPath);
  if (configExists && !options.force) {
    throw new Error(`Config file already exists: ${configPath}`);
  }

  const migrationsDirExists = fs.existsSync(migrationsDir);

  fs.mkdirSync(migrationsDir, { recursive: true });
  fs.writeFileSync(
    configPath,
    options.config
      ? `${JSON.stringify(config, null, 2)}\n`
      : createDefaultConfigFileContents(),
    "utf8"
  );

  return {
    configPath,
    migrationsDir,
    createdConfig: !configExists || Boolean(options.force),
    createdMigrationsDir: !migrationsDirExists,
  };
}
