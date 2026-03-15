import * as api from '@actual-app/api';
import cron from 'node-cron';
import fs from 'fs';

const SERVER_URL = process.env.ACTUAL_SERVER_URL;
const PASSWORD = process.env.ACTUAL_SERVER_PASSWORD;
const SYNC_IDS = (process.env.ACTUAL_BUDGET_SYNC_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean);
const CRON_SCHEDULE = process.env.CRON_SCHEDULE ?? '0 6 * * *';
const DATA_DIR = process.env.DATA_DIR ?? '/data';
const RUN_ON_START = process.env.RUN_ON_START === 'true';

if (!SERVER_URL || !PASSWORD || SYNC_IDS.length === 0) {
  console.error('Missing required env vars: ACTUAL_SERVER_URL, ACTUAL_SERVER_PASSWORD, ACTUAL_BUDGET_SYNC_IDS');
  process.exit(1);
}

async function syncBudget(syncId: string): Promise<void> {
  const budgetDir = `${DATA_DIR}/${syncId}`;
  fs.mkdirSync(budgetDir, { recursive: true });

  console.log(`[${new Date().toISOString()}] Syncing budget ${syncId}...`);

  await api.init({
    dataDir: budgetDir,
    serverURL: SERVER_URL!,
    password: PASSWORD!,
  });

  try {
    await api.downloadBudget(syncId);
    await api.runBankSync();
    console.log(`[${new Date().toISOString()}] Done syncing budget ${syncId}`);
  } finally {
    await api.shutdown();
  }
}

async function runSync(): Promise<void> {
  for (const syncId of SYNC_IDS) {
    try {
      await syncBudget(syncId);
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Error syncing ${syncId}:`, err);
    }
  }
}

console.log(`Auto-sync starting. Schedule: ${CRON_SCHEDULE}`);
console.log(`Budgets: ${SYNC_IDS.join(', ')}`);

cron.schedule(CRON_SCHEDULE, runSync, {
  timezone: process.env.TIMEZONE ?? 'America/Los_Angeles',
});

if (RUN_ON_START) {
  runSync();
}
