BEGIN TRANSACTION;
ALTER TABLE accounts RENAME COLUMN market_value TO live_balance;
ALTER TABLE accounts RENAME COLUMN market_value_date TO live_balance_date;
ALTER TABLE market_value_snapshots RENAME COLUMN market_value TO live_balance;
COMMIT;
