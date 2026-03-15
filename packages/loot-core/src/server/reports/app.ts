import { v4 as uuidv4 } from 'uuid';

import { q } from 'loot-core/shared/query';

import type { CustomReportData, CustomReportEntity } from '../../types/models';
import { createApp } from '../app';
import { aqlQuery } from '../aql';
import * as db from '../db';
import { ValidationError } from '../errors';
import { requiredFields } from '../models';
import { mutator } from '../mutators';
import { undoable } from '../undo';

export const reportModel = {
  validate(
    report: Omit<CustomReportEntity, 'tombstone'>,
    { update }: { update?: boolean } = {},
  ) {
    requiredFields('Report', report, ['conditionsOp'], update);

    if (!update || 'conditionsOp' in report) {
      if (!['and', 'or'].includes(report.conditionsOp)) {
        throw new ValidationError(
          'Invalid filter conditionsOp: ' + report.conditionsOp,
        );
      }
    }

    return report;
  },

  toJS(row: CustomReportData): CustomReportEntity {
    return {
      id: row.id,
      name: row.name,
      startDate: row.start_date,
      endDate: row.end_date,
      isDateStatic: row.date_static === 1,
      dateRange: row.date_range,
      mode: row.mode,
      groupBy: row.group_by,
      sortBy: row.sort_by,
      interval: row.interval,
      balanceType: row.balance_type,
      showEmpty: row.show_empty === 1,
      showOffBudget: row.show_offbudget === 1,
      showHiddenCategories: row.show_hidden === 1,
      showUncategorized: row.show_uncategorized === 1,
      trimIntervals: row.trim_intervals === 1,
      includeCurrentInterval: row.include_current === 1,
      graphType: row.graph_type,
      conditions: row.conditions ?? [],
      conditionsOp: row.conditions_op ?? 'and',
      metadata: row.metadata,
    };
  },

  fromJS(report: CustomReportEntity): CustomReportData {
    return {
      id: report.id,
      name: report.name,
      start_date: report.startDate,
      end_date: report.endDate,
      date_static: report.isDateStatic ? 1 : 0,
      date_range: report.dateRange,
      mode: report.mode,
      group_by: report.groupBy,
      sort_by: report.sortBy ?? 'desc',
      interval: report.interval,
      balance_type: report.balanceType,
      show_empty: report.showEmpty ? 1 : 0,
      show_offbudget: report.showOffBudget ? 1 : 0,
      show_hidden: report.showHiddenCategories ? 1 : 0,
      show_uncategorized: report.showUncategorized ? 1 : 0,
      trim_intervals: report.trimIntervals ? 1 : 0,
      include_current: report.includeCurrentInterval ? 1 : 0,
      graph_type: report.graphType,
      conditions: report.conditions,
      conditions_op: report.conditionsOp,
    };
  },
};

// Sort reports by alphabetical order
function sort(reports: CustomReportEntity[]) {
  return reports.sort((a, b) =>
    a.name && b.name
      ? a.name.trim().localeCompare(b.name.trim(), undefined, {
          ignorePunctuation: true,
        })
      : 0,
  );
}

async function getReports() {
  // Use aql because it auto deserialized json columns e.g. conditions
  const { data }: { data: CustomReportData[] } = await aqlQuery(
    q('custom_reports').select('*'),
  );
  return sort(data.map(reportModel.toJS));
}

async function reportNameExists(
  name: string,
  reportId: string,
  newItem: boolean,
) {
  const idForName = await db.first<Pick<db.DbCustomReport, 'id'>>(
    'SELECT id from custom_reports WHERE tombstone = 0 AND name = ?',
    [name],
  );

  //no existing name found
  if (idForName === null) {
    return false;
  }

  //for update/rename
  if (!newItem) {
    /*
    -if the found item is the same as the existing item
    then no name change was made.
    -if they are not the same then there is another
    item with that name already.
    */
    return idForName.id !== reportId;
  }

  //default return: item was found but does not match current name
  return true;
}

async function createReport(report: CustomReportEntity) {
  const reportId = uuidv4();
  const item: CustomReportEntity = {
    ...report,
    id: reportId,
  };
  if (!item.name) {
    throw new Error('Report name is required');
  }

  const nameExists = await reportNameExists(item.name, item.id ?? '', true);
  if (nameExists) {
    throw new Error('There is already a report named ' + item.name);
  }

  // Create the report here based on the info
  await db.insertWithSchema('custom_reports', reportModel.fromJS(item));

  return reportId;
}

async function updateReport(item: CustomReportEntity) {
  if (!item.name) {
    throw new Error('Report name is required');
  }

  if (!item.id) {
    throw new Error('Report recall error');
  }

  const nameExists = await reportNameExists(item.name, item.id, false);
  if (nameExists) {
    throw new Error('There is already a report named ' + item.name);
  }

  await db.updateWithSchema('custom_reports', reportModel.fromJS(item));
}

async function deleteReport(id: CustomReportEntity['id']) {
  await db.delete_('custom_reports', id);
}

type ActualNetWorthSnapshot = { date: string; net_worth: number };

async function getActualNetWorthSnapshots({
  startDate,
  endDate,
  useCalculatedFallback = false,
}: {
  startDate: string;
  endDate: string;
  useCalculatedFallback?: boolean;
}): Promise<ActualNetWorthSnapshot[]> {
  // Carry-forward: for each date with a snapshot, use each snapshot account's
  // most recent actual_balance at or before that date.
  const snapshotRows = db.runQuery<ActualNetWorthSnapshot>(
    `WITH dates AS (
       SELECT DISTINCT date FROM market_value_snapshots WHERE date >= ? AND date <= ?
     ),
     accounts AS (
       SELECT DISTINCT account_id FROM market_value_snapshots
     ),
     carried AS (
       SELECT
         d.date,
         (
           SELECT SUM(m.actual_balance)
           FROM market_value_snapshots m
           WHERE m.account_id = a.account_id
             AND m.date = (
               SELECT MAX(m2.date) FROM market_value_snapshots m2
               WHERE m2.account_id = a.account_id AND m2.date <= d.date
             )
         ) as account_value
       FROM dates d
       CROSS JOIN accounts a
     )
     SELECT date, SUM(account_value) as net_worth
     FROM carried
     WHERE account_value IS NOT NULL
     GROUP BY date
     ORDER BY date ASC`,
    [startDate, endDate],
    true,
  );

  if (!useCalculatedFallback || snapshotRows.length === 0) {
    return snapshotRows;
  }

  // Find accounts that have NO snapshots at all — these use transaction-derived balance.
  const fallbackAccounts = db.runQuery<{ id: string }>(
    `SELECT id FROM accounts
     WHERE tombstone = 0 AND closed = 0
       AND id NOT IN (SELECT DISTINCT account_id FROM market_value_snapshots)`,
    [],
    true,
  );

  if (fallbackAccounts.length === 0) {
    return snapshotRows;
  }

  // Fetch daily transaction sums per fallback account up to endDate.
  const placeholders = fallbackAccounts.map(() => '?').join(',');
  const txRows = db.runQuery<{ acct: string; date: string; amount: number }>(
    `SELECT acct, date, SUM(amount) as amount
     FROM transactions
     WHERE acct IN (${placeholders})
       AND tombstone = 0
       AND isChild = 0
       AND date <= ?
     GROUP BY acct, date
     ORDER BY acct, date ASC`,
    [...fallbackAccounts.map(a => a.id), endDate],
    true,
  );

  // Build cumulative balance per fallback account: Map<accountId, sorted [{date, cumBalance}]>
  const cumByAccount = new Map<string, { date: string; cumBalance: number }[]>();
  for (const acct of fallbackAccounts) {
    cumByAccount.set(acct.id, []);
  }
  // txRows is already sorted by acct, date
  const runningTotals = new Map<string, number>();
  for (const row of txRows) {
    const prev = runningTotals.get(row.acct) ?? 0;
    const cum = prev + row.amount;
    runningTotals.set(row.acct, cum);
    cumByAccount.get(row.acct)!.push({ date: row.date, cumBalance: cum });
  }

  // For a given account and date, find its running balance at or before that date.
  function balanceAsOf(accountId: string, date: string): number {
    const entries = cumByAccount.get(accountId) ?? [];
    let balance = 0;
    for (const entry of entries) {
      if (entry.date <= date) balance = entry.cumBalance;
      else break;
    }
    return balance;
  }

  // Add fallback balances to each snapshot date point.
  return snapshotRows.map(row => {
    const fallbackSum = fallbackAccounts.reduce(
      (sum, acct) => sum + balanceAsOf(acct.id, row.date),
      0,
    );
    return { date: row.date, net_worth: row.net_worth + fallbackSum };
  });
}

export type ReportsHandlers = {
  'report/get': typeof getReports;
  'report/create': typeof createReport;
  'report/update': typeof updateReport;
  'report/delete': typeof deleteReport;
  'report/actual-net-worth-snapshots': typeof getActualNetWorthSnapshots;
};

// Expose functions to the client
export const app = createApp<ReportsHandlers>();

app.method('report/get', getReports);
app.method('report/create', mutator(undoable(createReport)));
app.method('report/update', mutator(undoable(updateReport)));
app.method('report/delete', mutator(undoable(deleteReport)));
app.method('report/actual-net-worth-snapshots', getActualNetWorthSnapshots);
