// A generic migration file that uses raw SQL strings
export async function up(db: any) {
  await db.raw("ALTER TABLE users DROP COLUMN old_field");
  await db.raw("ALTER TABLE users ADD COLUMN score integer DEFAULT 0");
  await db.raw("CREATE INDEX idx_score ON users (score)");
}

export async function down(db: any) {
  await db.raw("DROP TABLE IF EXISTS users");
}
