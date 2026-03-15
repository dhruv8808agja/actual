import { send } from 'loot-core/platform/client/connection';
import * as monthUtils from 'loot-core/shared/months';

import type { useSpreadsheet } from '@desktop-client/hooks/useSpreadsheet';

export type ActualNetWorthDataPoint = {
  date: string;
  netWorth: number;
};

export type ActualNetWorthData = {
  graphData: ActualNetWorthDataPoint[];
  currentNetWorth: number;
};

export function createSpreadsheet(
  startMonth: string,
  endMonth: string,
  useCalculatedFallback = false,
) {
  return async (
    _spreadsheet: ReturnType<typeof useSpreadsheet>,
    setData: (data: ActualNetWorthData) => void,
  ) => {
    const startDate = monthUtils.firstDayOfMonth(startMonth);
    const endDate = monthUtils.lastDayOfMonth(endMonth);

    const rows = await send('report/actual-net-worth-snapshots', {
      startDate,
      endDate,
      useCalculatedFallback,
    });

    const graphData: ActualNetWorthDataPoint[] = (
      rows as { date: string; net_worth: number }[]
    ).map(r => ({ date: r.date, netWorth: r.net_worth }));

    const currentNetWorth =
      graphData.length > 0 ? graphData[graphData.length - 1].netWorth : 0;

    setData({ graphData, currentNetWorth });
  };
}
