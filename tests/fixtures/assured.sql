-- excellent-migrations:safety-assured-for-this-file table_dropped

-- excellent-migrations:safety-assured-for-next-line column_removed
ALTER TABLE users DROP COLUMN legacy_email;

DROP TABLE temp_data;
