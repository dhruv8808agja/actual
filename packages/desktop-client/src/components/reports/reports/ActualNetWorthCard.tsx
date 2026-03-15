import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Block } from '@actual-app/components/block';
import { useResponsive } from '@actual-app/components/hooks/useResponsive';
import { styles } from '@actual-app/components/styles';
import { View } from '@actual-app/components/view';

import * as monthUtils from 'loot-core/shared/months';
import type { ActualNetWorthWidget } from 'loot-core/types/models';

import { FinancialText } from '@desktop-client/components/FinancialText';
import { PrivacyFilter } from '@desktop-client/components/PrivacyFilter';
import { ActualNetWorthGraph } from '@desktop-client/components/reports/graphs/ActualNetWorthGraph';
import { LoadingIndicator } from '@desktop-client/components/reports/LoadingIndicator';
import { ReportCard } from '@desktop-client/components/reports/ReportCard';
import { ReportCardName } from '@desktop-client/components/reports/ReportCardName';
import { createSpreadsheet } from '@desktop-client/components/reports/spreadsheets/actual-net-worth-spreadsheet';
import { useReport } from '@desktop-client/components/reports/useReport';
import { useFormat } from '@desktop-client/hooks/useFormat';

type ActualNetWorthCardProps = {
  widgetId: string;
  isEditing?: boolean;
  meta?: ActualNetWorthWidget['meta'];
  onMetaChange: (newMeta: ActualNetWorthWidget['meta']) => void;
  onRemove: () => void;
  onCopy: (targetDashboardId: string) => void;
};

export function ActualNetWorthCard({
  widgetId,
  isEditing,
  meta = {},
  onMetaChange,
  onRemove,
  onCopy,
}: ActualNetWorthCardProps) {
  const { t } = useTranslation();
  const { isNarrowWidth } = useResponsive();
  const format = useFormat();
  const [nameMenuOpen, setNameMenuOpen] = useState(false);
  const [isCardHovered, setIsCardHovered] = useState(false);

  const startDate =
    meta?.startDate ?? monthUtils.subMonths(monthUtils.currentMonth(), 11);
  const endDate = meta?.endDate ?? monthUtils.currentMonth();

  const params = useMemo(
    () => createSpreadsheet(startDate, endDate),
    [startDate, endDate],
  );
  const data = useReport('actual_net_worth', params);

  return (
    <ReportCard
      isEditing={isEditing}
      disableClick={nameMenuOpen}
      to={`/reports/actual-net-worth/${widgetId}`}
      menuItems={[
        { name: 'rename', text: t('Rename') },
        { name: 'remove', text: t('Remove') },
      ]}
      onMenuSelect={item => {
        switch (item) {
          case 'rename':
            setNameMenuOpen(true);
            break;
          case 'remove':
            onRemove();
            break;
          default:
            throw new Error(`Unrecognized selection: ${item}`);
        }
      }}
    >
      <View
        style={{ flex: 1 }}
        onPointerEnter={() => setIsCardHovered(true)}
        onPointerLeave={() => setIsCardHovered(false)}
      >
        <View style={{ flexDirection: 'row', padding: 20 }}>
          <View style={{ flex: 1 }}>
            <ReportCardName
              name={meta?.name || t('Actual Net Worth')}
              isEditing={nameMenuOpen}
              onChange={newName => {
                onMetaChange({ ...meta, name: newName });
                setNameMenuOpen(false);
              }}
              onClose={() => setNameMenuOpen(false)}
            />
          </View>
          {data && (
            <View style={{ textAlign: 'right' }}>
              <Block
                style={{
                  ...styles.mediumText,
                  fontWeight: 500,
                  marginBottom: 5,
                }}
              >
                <PrivacyFilter activationFilters={[!isCardHovered]}>
                  <FinancialText>
                    {format(data.currentNetWorth, 'financial')}
                  </FinancialText>
                </PrivacyFilter>
              </Block>
            </View>
          )}
        </View>

        {data ? (
          <ActualNetWorthGraph
            graphData={data.graphData}
            compact
            showTooltip={!isEditing && !isNarrowWidth}
            style={{ height: 'auto', flex: 1 }}
          />
        ) : (
          <LoadingIndicator />
        )}
      </View>
    </ReportCard>
  );
}
