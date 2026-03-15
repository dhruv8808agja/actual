# Custom Changes

This file documents local modifications made to this fork of Actual Budget.

---

## 1. Text-matching operators for id-type fields (Payee, Account, Category)

**Branch:** `fix/rules-id-field-text-ops`

**Files changed:**
- `packages/desktop-client/src/components/rules/RuleEditor.tsx`
- `packages/desktop-client/src/components/util/GenericInput.tsx`
- `packages/desktop-client/src/components/rules/Value.tsx`
- `packages/desktop-client/src/components/rules/ConditionExpression.tsx`
- `packages/loot-core/src/server/rules/condition.ts`
- `packages/loot-core/src/server/transactions/transaction-rules.ts`

### What was changed

The rules engine backend already supported `contains`, `doesNotContain`, and `matches`
(regex) operators for string fields, but the UI intentionally hid them for `id`-type
fields (Payee, Account, Category) with a TODO comment:
```
// TODO: Add matches op support for payees, accounts, categories.
```

These operators were added to the UI and wired up end-to-end so that a single rule
like `Payee contains domino` catches all Domino's payee variants instead of requiring
one `is` rule per variant.

### How it works

- **UI (`RuleEditor.tsx`):** Removed the filter that hid `contains`/`doesNotContain`/
  `matches` from the operator dropdown for `id`-type fields. Added value-reset logic
  when switching between picker ops (is/oneOf) and text ops.

- **UI (`GenericInput.tsx`):** When the selected op is a text op, renders a plain text
  `<Input>` instead of the payee/account/category autocomplete picker.

- **UI (`Value.tsx` + `ConditionExpression.tsx`):** Passes `op` through to the `Value`
  component so the rule display shows the raw text value instead of trying to look it
  up as an ID (which previously showed "(deleted)").

- **Backend (`condition.ts`):** When `contains`/`doesNotContain`/`matches` is used on
  an `id`-type field, the evaluator resolves the human-readable name (`payee_name`,
  `_account_name`, `category_name`) instead of matching against the UUID. Falls back
  to the UUID if the name is not resolved.

- **Backend (`transaction-rules.ts`):** `prepareTransactionForRules` now also resolves
  `_category_name` (payee and account were already resolved). Note: the field must be
  prefixed with `_` — the DB layer silently strips `_`-prefixed fields before writing,
  while unknown non-`_` fields throw an error (`Field "x" does not exist on table`).

### Known side effects

1. **Extra DB call per transaction:** `prepareTransactionForRules` now calls `getCategory`
   for every transaction that has a category set. This is consistent with how payee and
   account are handled but adds one more DB lookup per transaction during rule evaluation.
   Can be noticeable on bulk "run rules on all transactions" for large datasets.

2. **Unindexed rule scanning:** The `RuleIndexer` only indexes `is`/`isNot`/`oneOf`/
   `notOneOf` operators. Rules using `contains`/`matches` on a Payee field go into the
   wildcard `'*'` bucket and run against every transaction on every import — unlike `is`
   rules which are O(1) lookups. Keep the number of such rules small to avoid slowing
   imports.

3. **Pre-stage rules won't match:** Rules run in two stages — `pre` (before payee
   matching) and `post` (after). Since `payee_name` is only resolved after the payee
   UUID is set, a `Payee contains X` rule placed in the `pre` stage will silently never
   match. Use `post` stage (or `imported_payee` field) for text matching during import.

4. **Behavior change on existing rules:** Previously, `payee contains X` was always
   `false` (it matched against a UUID). It now matches against the payee name. Any
   existing rule using these ops on an id field will now start matching.

### Why not use `imported_payee` instead?

`imported_payee` holds the raw bank string and is only populated at import time.
For existing transactions that were already matched to a payee, `imported_payee` is
blank and rules on it silently do nothing. The `Payee contains` approach works on
both existing and newly imported transactions.

---

## 2. On-budget / Off-budget toggle for existing accounts

**Files changed:**
- `packages/desktop-client/src/components/sidebar/Account.tsx`
- `packages/loot-core/src/server/accounts/app.ts`

### What was changed

The UI had no way to toggle an existing account between on-budget and off-budget after
creation (only available in the create account modal). Added a **"Make off-budget"** /
**"Make on-budget"** option to the account context menu in the sidebar (right-click or
long-press). The backend `updateAccount` handler was also extended to accept the
`offbudget` field since it previously only allowed `name` and `last_reconciled`.

### Known side effects

- Toggling does not retroactively fix past transactions or budget entries. Existing
  transfers between this and other on-budget accounts may appear as categorized expenses
  in past months after toggling.
- Does not show for closed accounts.

---

## 3. SimpleFin actual balance tracking

**Branch:** `fix/market-value-tracking` (merged into `feature/dhruv`)

**Files changed:**
- `packages/loot-core/migrations/1773550270894_add_market_value_to_accounts.sql`
- `packages/loot-core/migrations/1773550270895_add_market_value_snapshots.sql`
- `packages/loot-core/migrations/1773550270896_rename_market_value_to_live_balance.sql`
- `packages/loot-core/migrations/1773550270897_rename_live_balance_to_actual_balance.sql`
- `packages/loot-core/src/types/models/account.ts`
- `packages/loot-core/src/server/db/types/index.ts`
- `packages/loot-core/src/server/accounts/sync.ts`
- `packages/loot-core/src/server/accounts/app.ts`
- `packages/desktop-client/src/components/accounts/Balance.tsx`
- `packages/desktop-client/src/components/sidebar/Account.tsx`

### What was changed

After each SimpleFin bank sync, the institution-reported balance is stored as `actual_balance` on the account (alongside the existing transaction-derived balance). This allows tracking drift between what Actual has recorded and what the institution reports — useful for investment/brokerage accounts where market value fluctuates independently of transactions.

- **DB:** Added `actual_balance` and `actual_balance_date` columns to the `accounts` table. Added `market_value_snapshots` table for time-series history.
- **Sync (`sync.ts`):** After `updateAccountBalance`, calls `updateAccountActualBalance` for SimpleFin accounts, writing both the current balance and a daily snapshot.
- **API (`app.ts`):** `getAccounts` now includes `actual_balance` and `actual_balance_date` in the returned account objects.
- **Sidebar (`Account.tsx`):** SimpleFin accounts show two balance columns — tracked (transaction-derived, default color) and actual (institution-reported, green bold italic). Non-SimpleFin accounts show a single column. Shows "N/A" when actual balance hasn't been synced yet.
- **Account detail (`Balance.tsx`):** Shows "Actual balance (date):" pill and "Drift:" pill (actual − tracked; positive = green).

### Known side effects

- `actual_balance` is written via direct SQL (same pattern as `balance_current`) and does NOT sync via CRDT to other devices — it is re-populated on each bank sync.
- For accounts where SimpleFin reports the total portfolio value (e.g. Robinhood), `actual_balance` reflects market value, not just deposited cash. Drift will fluctuate with market prices.

---

## 4. Actual Net Worth Widget (Phase 3)

**Files changed:**
- `packages/loot-core/src/types/models/dashboard.ts`
- `packages/loot-core/src/server/reports/app.ts`
- `packages/desktop-client/src/components/reports/spreadsheets/actual-net-worth-spreadsheet.ts`
- `packages/desktop-client/src/components/reports/graphs/ActualNetWorthGraph.tsx`
- `packages/desktop-client/src/components/reports/reports/ActualNetWorthCard.tsx`
- `packages/desktop-client/src/components/reports/reports/ActualNetWorth.tsx`
- `packages/desktop-client/src/components/reports/ReportRouter.tsx`
- `packages/desktop-client/src/components/reports/Overview.tsx`

### What was changed

Added an **Actual Net Worth** dashboard widget and full report page that charts
institution-reported (`actual_balance`) balances over time from the `market_value_snapshots`
table populated by SimpleFin bank sync.

- **Widget type:** Added `ActualNetWorthWidget` (`actual-net-worth-card`) to `dashboard.ts`
  with `name`, `startDate`, `endDate`, and `showCalculatedFallback` meta fields.
- **Backend handler (`reports/app.ts`):** Added `report/actual-net-worth-snapshots` handler
  using a carry-forward CTE SQL query. For each snapshot date, uses each account's most
  recent `actual_balance` at or before that date (not just accounts that synced on that
  exact day). Called directly via `send()` — not via AQL — to avoid AQL schema validation
  on custom tables.
- **Spreadsheet:** Calls the backend handler via `send()`, converts rows to `{date, netWorth}`
  data points, computes `currentNetWorth` as the last data point's value.
- **Graph (`ActualNetWorthGraph.tsx`):** Area chart (recharts `AreaChart`) with gradient fill
  matching the original Net Worth widget's style — positive/negative split gradient, privacy
  mode support, compact mode for dashboard card, full mode with tooltips for report page.
- **Dashboard card (`ActualNetWorthCard.tsx`):** Shows current actual net worth + compact chart.
  Context menu includes toggle for estimated balances. Added to the "Add widget" menu.
- **Full page (`ActualNetWorth.tsx`):** `/reports/actual-net-worth` and
  `/reports/actual-net-worth/:id`. Toggle button in header for estimated balances.

### Estimated balances toggle

Accounts with no SimpleFin snapshots at all can optionally be included using their
transaction-derived running balance as a fallback. Controlled by `showCalculatedFallback`
in widget meta.

- **Dashboard card:** Toggle via the "⋯" context menu ("Include/Hide estimated balances").
- **Full page:** Toggle button in the page header (primary/normal variant shows ON/OFF state). **⚠️ Known bug: toggle button `onPress` never fires — click reaches the wrapper div but react-aria `usePress` does not trigger. See `DEBUG_TOGGLE.md` for full investigation.**
- **Backend:** When `useCalculatedFallback=true`, finds accounts with no snapshots, computes
  their cumulative transaction balance at each snapshot date, and adds it to the net worth.

### Known side effects

- Only shows data points for days when at least one SimpleFin bank sync occurred.
- Carry-forward means the chart reflects each account's last known actual balance, not
  its value on that exact date.
- Estimated balances (fallback) are transaction-derived and don't reflect unrealized gains/losses.

---

## Development workflow

### Fast UI deploy (browser-only changes)

When only modifying UI files (`packages/desktop-client`, `packages/component-library`), use the fast deploy script instead of a full image rebuild:

```bash
cd /home/dagja/actual && ./fast-deploy-ui.sh
```

This builds only the browser bundle (~2 min) and hot-copies it into the running container. No container restart needed — just hard-refresh the browser.

**Use full image rebuild for:** `sync.ts`, migrations, loot-core server code, auto-sync changes.

```bash
cd /home/dagja/actual
docker build -f sync-server.Dockerfile -t actual-budget-custom:latest .
cd /srv/docker/actual-budget && docker compose up -d --force-recreate actual
```
