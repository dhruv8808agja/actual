BEGIN TRANSACTION;
CREATE TABLE market_value_snapshots (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  date TEXT NOT NULL,
  market_value INTEGER NOT NULL,
  UNIQUE(account_id, date)
);
COMMIT;
