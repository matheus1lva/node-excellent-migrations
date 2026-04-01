-- A safe migration
CREATE TABLE users (
  id serial PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL
);

CREATE INDEX CONCURRENTLY idx_users_email ON users (email);

ALTER TABLE users ADD COLUMN phone text;
