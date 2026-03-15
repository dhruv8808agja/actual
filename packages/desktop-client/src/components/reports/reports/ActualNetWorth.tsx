import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import { Button } from '@actual-app/components/button';
import { useResponsive } from '@actual-app/components/hooks/useResponsive';
import { styles } from '@actual-app/components/styles';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { send } from 'loot-core/platform/client/connection';
import * as monthUtils from 'loot-core/shared/months';
import type { ActualNetWorthWidget } from 'loot-core/types/models';

import { EditablePageHeaderTitle } from '@desktop-client/components/EditablePageHeaderTitle';
import { FinancialText } from '@desktop-client/components/FinancialText';
import { MobileBackButton } from '@desktop-client/components/mobile/MobileBackButton';
import {
  MobilePageHeader,
  Page,
  PageHeader,
} from '@desktop-client/components/Page';
import { PrivacyFilter } from '@desktop-client/components/PrivacyFilter';
import { ActualNetWorthGraph } from '@desktop-client/components/reports/graphs/ActualNetWorthGraph';
import { LoadingIndicator } from '@desktop-client/components/reports/LoadingIndicator';
import type { ActualNetWorthData } from '@desktop-client/components/reports/spreadsheets/actual-net-worth-spreadsheet';
import { useDashboardWidget } from '@desktop-client/hooks/useDashboardWidget';
import { useFormat } from '@desktop-client/hooks/useFormat';
import { useNavigate } from '@desktop-client/hooks/useNavigate';
import { useUpdateDashboardWidgetMutation } from '@desktop-client/reports/mutations';

export function ActualNetWorth() {
  const params = useParams();
  const { data: widget, isLoading } = useDashboardWidget<ActualNetWorthWidget>({
    id: params.id,
    type: 'actual-net-worth-card',
  });

  if (isLoading) {
    return <LoadingIndicator />;
  }

  return <ActualNetWorthInner widget={widget} />;
}

type ActualNetWorthInnerProps = {
  widget?: ActualNetWorthWidget;
};

function ActualNetWorthInner({ widget }: ActualNetWorthInnerProps) {
  const { t } = useTranslation();
  const { isNarrowWidth } = useResponsive();
  const navigate = useNavigate();
  const format = useFormat();
  const updateWidget = useUpdateDashboardWidgetMutation();

  const startDate =
    widget?.meta?.startDate ??
    monthUtils.subMonths(monthUtils.currentMonth(), 23);
  const endDate = widget?.meta?.endDate ?? monthUtils.currentMonth();

  const [showCalculatedFallback, setShowCalculatedFallback] = useState(
    widget?.meta?.showCalculatedFallback ?? false,
  );

  const [data, setData] = useState<ActualNetWorthData | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    console.log('[ANW] fetching, useCalculatedFallback=', showCalculatedFallback);
    void send('report/actual-net-worth-snapshots', {
      startDate: monthUtils.firstDayOfMonth(startDate),
      endDate: monthUtils.lastDayOfMonth(endDate),
      useCalculatedFallback: showCalculatedFallback,
    }).then((rows: unknown) => {
      if (cancelled) return;
      const typedRows = rows as { date: string; net_worth: number }[];
      console.log('[ANW] got rows:', typedRows.length, 'fallback=', showCalculatedFallback, 'last=', typedRows[typedRows.length - 1]);
      const graphData = typedRows.map(r => ({
        date: r.date,
        netWorth: r.net_worth,
      }));
      const currentNetWorth =
        graphData.length > 0 ? graphData[graphData.length - 1].netWorth : 0;
      setData({ graphData, currentNetWorth });
    }).catch(err => console.error('[ANW] error:', err));
    return () => {
      cancelled = true;
    };
  }, [startDate, endDate, showCalculatedFallback]);

  const title = widget?.meta?.name ?? t('Actual Net Worth');

  function onSaveWidgetName(newName: string) {
    if (!widget) return;
    updateWidget.mutate({
      widget: { id: widget.id, meta: { ...widget.meta, name: newName } },
    });
  }

  function onToggleFallback() {
    console.log('[ANW] onToggleFallback called, current=', showCalculatedFallback);
    const next = !showCalculatedFallback;
    setShowCalculatedFallback(next);
    if (widget) {
      updateWidget.mutate({
        widget: {
          id: widget.id,
          meta: { ...widget.meta, showCalculatedFallback: next },
        },
      });
    }
  }

  if (isNarrowWidth) {
    return (
      <Page
        header={
          <MobilePageHeader
            title={title}
            leftContent={
              <MobileBackButton onPress={() => navigate('/reports')} />
            }
          />
        }
        padding={0}
      >
        {data ? (
          <ActualNetWorthGraph
            graphData={data.graphData}
            style={{ height: 300 }}
          />
        ) : (
          <LoadingIndicator />
        )}
      </Page>
    );
  }

  return (
    <Page
      header={
        <PageHeader
          title={
            <EditablePageHeaderTitle
              title={title}
              onSave={onSaveWidgetName}
            />
          }
        />
      }
      padding={0}
    >
      <View
        style={{
          padding: '0 20px',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 20,
          flexWrap: 'wrap',
        }}
      >
        <View>
          <div
            style={{
              ...styles.smallText,
              color: theme.pageTextSubdued,
              marginBottom: 4,
            }}
          >
            {t('Current actual net worth')}
          </div>
          {data ? (
            <PrivacyFilter>
              <span style={{ ...styles.mediumText, fontWeight: 600 }}>
                <FinancialText>
                  {format(data.currentNetWorth, 'financial')}
                </FinancialText>
              </span>
            </PrivacyFilter>
          ) : (
            <LoadingIndicator />
          )}
        </View>

        {/* DEBUG: div wrapper to diagnose whether click reaches this area at all */}
        <div
          style={{ marginTop: 'auto' }}
          onClick={() =>
            console.log('[ANW] wrapper div onClick fired — click IS reaching the area')
          }
        >
          <Button
            variant={showCalculatedFallback ? 'primary' : 'normal'}
            onPress={onToggleFallback}
          >
            {showCalculatedFallback
              ? t('Estimated balances: ON')
              : t('Estimated balances: OFF')}
          </Button>
        </div>
      </View>

      {data ? (
        <ActualNetWorthGraph
          graphData={data.graphData}
          showTooltip
          style={{ height: 400, marginTop: 20 }}
        />
      ) : (
        <LoadingIndicator />
      )}
    </Page>
  );
}
