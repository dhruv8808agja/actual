// @ts-strict-ignore
import React, { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { AlignedText } from '@actual-app/components/aligned-text';
import type { CSSProperties } from '@actual-app/components/styles';
import { theme } from '@actual-app/components/theme';
import { css } from '@emotion/css';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TooltipContentProps } from 'recharts';

import { computePadding } from './util/computePadding';

import { FinancialText } from '@desktop-client/components/FinancialText';
import { useRechartsAnimation } from '@desktop-client/components/reports/chart-theme';
import { Container } from '@desktop-client/components/reports/Container';
import { numberFormatterTooltip } from '@desktop-client/components/reports/numberFormatter';
import type { ActualNetWorthDataPoint } from '@desktop-client/components/reports/spreadsheets/actual-net-worth-spreadsheet';
import { useFormat } from '@desktop-client/hooks/useFormat';
import { usePrivacyMode } from '@desktop-client/hooks/usePrivacyMode';

type TooltipProps = TooltipContentProps<number, string> & {
  style?: CSSProperties;
};

function ActualNetWorthTooltip({ active, payload, style }: TooltipProps) {
  const { t } = useTranslation();

  if (active && payload && payload.length) {
    return (
      <div
        className={css([
          {
            zIndex: 1000,
            pointerEvents: 'none',
            borderRadius: 2,
            boxShadow: '0 1px 6px rgba(0, 0, 0, .20)',
            backgroundColor: theme.menuBackground,
            color: theme.menuItemText,
            padding: 10,
          },
          style,
        ])}
      >
        <div style={{ marginBottom: 10 }}>
          <strong>{payload[0].payload.date}</strong>
        </div>
        <div style={{ lineHeight: 1.5 }}>
          <AlignedText
            left={t('Actual net worth:')}
            right={
              <FinancialText as="strong">
                {payload[0].payload.netWorthFormatted}
              </FinancialText>
            }
          />
        </div>
      </div>
    );
  }
  return null;
}

type ActualNetWorthGraphProps = {
  graphData: ActualNetWorthDataPoint[];
  compact?: boolean;
  showTooltip?: boolean;
  style?: CSSProperties;
};

export function ActualNetWorthGraph({
  graphData,
  compact = false,
  showTooltip = true,
  style,
}: ActualNetWorthGraphProps) {
  const privacyMode = usePrivacyMode();
  const id = useId();
  const format = useFormat();
  const animationProps = useRechartsAnimation({ isAnimationActive: false });

  const gradientId = `actualNetWorthSplitColor-${id}`;

  const gradientOffset = () => {
    if (graphData.length === 0) return 1;
    const dataMax = Math.max(...graphData.map(d => d.netWorth));
    const dataMin = Math.min(...graphData.map(d => d.netWorth));
    if (dataMax <= 0) return 0;
    if (dataMin >= 0) return 1;
    return dataMax / (dataMax - dataMin);
  };

  const off = gradientOffset();

  const tickFormatter = (value: number) =>
    privacyMode ? '...' : format(Math.round(value), 'financial-no-decimals');

  // Enrich data with pre-formatted values for tooltip
  const data = graphData.map(d => ({
    ...d,
    y: d.netWorth,
    x: d.date,
    netWorthFormatted: format(d.netWorth, 'financial'),
  }));

  return (
    <Container
      style={{
        ...style,
        ...(compact && { height: 'auto' }),
        position: 'relative',
      }}
    >
      {(width, height) =>
        data.length > 0 && (
          <div style={{ ...(!compact && { marginTop: '15px' }), position: 'relative' }}>
            <AreaChart
              responsive
              width={width}
              height={height}
              data={data}
              margin={{
                top: 0,
                right: 0,
                left: compact
                  ? 0
                  : computePadding(
                      data.map(d => d.y),
                      value => format(value, 'financial-no-decimals'),
                    ),
                bottom: 0,
              }}
            >
              {compact ? null : (
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
              )}
              <XAxis
                dataKey="x"
                hide={compact}
                tick={{ fill: theme.pageText }}
                tickLine={{ stroke: theme.pageText }}
              />
              <YAxis
                dataKey="y"
                domain={['auto', 'auto']}
                hide={compact}
                tickFormatter={tickFormatter}
                tick={{ fill: theme.pageText }}
                tickLine={{ stroke: theme.pageText }}
              />
              {showTooltip && (
                <Tooltip<number, string>
                  content={props => (
                    <ActualNetWorthTooltip {...props} style={style} />
                  )}
                  formatter={numberFormatterTooltip}
                  isAnimationActive={false}
                />
              )}
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset={off}
                    stopColor={theme.reportsChartFill}
                    stopOpacity={0.2}
                  />
                  <stop
                    offset={off}
                    stopColor={theme.reportsNumberNegative}
                    stopOpacity={0.2}
                  />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dot={false}
                activeDot={false}
                {...animationProps}
                dataKey="y"
                stroke={theme.reportsChartFill}
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                fillOpacity={1}
                connectNulls
              />
            </AreaChart>
          </div>
        )
      }
    </Container>
  );
}
