BEGIN TRANSACTION;
ALTER TABLE accounts RENAME COLUMN live_balance TO actual_balance;
ALTER TABLE accounts RENAME COLUMN live_balance_date TO actual_balance_date;
ALTER TABLE market_value_snapshots RENAME COLUMN live_balance TO actual_balance;
COMMIT;
