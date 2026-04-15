-- Migration: add new features
ALTER TABLE users DROP COLUMN legacy_email;

ALTER TABLE users ADD COLUMN age integer DEFAULT 0;

ALTER TABLE users ALTER COLUMN name TYPE text;

ALTER TABLE users RENAME COLUMN email TO email_address;

ALTER TABLE old_users RENAME TO archived_users;

DROP TABLE IF EXISTS temp_data;

ALTER TABLE users ALTER COLUMN name SET NOT NULL;

ALTER TABLE users ADD COLUMN metadata json;

CREATE INDEX idx_users_name ON users (name);

ALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE orders ADD CONSTRAINT chk_amount CHECK (amount > 0);

ALTER TABLE users ADD CONSTRAINT uq_email UNIQUE (email);

ALTER TABLE users ADD COLUMN id uuid DEFAULT uuid_generate_v4();

UPDATE users SET name = 'unknown' WHERE name IS NULL;
