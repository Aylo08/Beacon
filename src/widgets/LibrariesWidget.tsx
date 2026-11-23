// "Bibliothèques": whether each university library is open and how full it is
// (Affluences live data, refreshed every 5 s while the home screen is shown).
import { useIsFocused } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';
import { hoursLabel, LIBRARIES, type Flow, type LibraryStatus } from '../lib/libraries';
import { makeStyles, occupancyColor, useAppTheme } from '../lib/theme';
import { useLibrary } from '../lib/useLive';
import { t, type TranslationKey } from '../lib/i18n';

const FLOW_LABEL: Record<Flow, TranslationKey> = {
  FLUID: 'library.flowFluid',
  MODERATE: 'library.flowModerate',
  DENSE: 'library.flowDense',
};

export function LibrariesWidget() {
  const focused = useIsFocused();
  return (
    <View>
      {LIBRARIES.map((lib, i) => (
        <LibraryRow key={lib.id} library={lib} active={focused} divider={i > 0} />
      ))}
    </View>
  );
}

function LibraryRow({ library, active, divider }: { library: (typeof LIBRARIES)[number]; active: boolean; divider: boolean }) {
  const styles = useStyles();
  const { colors } = useAppTheme();
  const { status, error } = useLibrary(library.id, active);

  return (
    <View style={[styles.row, divider && styles.divider]} accessible accessibilityLabel={a11yLabel(library.label, status)}>
      <View style={styles.body}>
        <Text style={styles.name}>{library.label}</Text>
        <Text style={styles.muted} numberOfLines={1}>
          {status ? hoursLabel(status) : library.campus}
        </Text>
      </View>
      {status ? (
        <Occupancy status={status} />
      ) : error ? (
        <Text style={styles.muted}>{t('library.unavailable')}</Text>
      ) : (
        <ActivityIndicator color={colors.textMuted} />
      )}
    </View>
  );
}

function Occupancy({ status }: { status: LibraryStatus }) {
  const styles = useStyles();
  const { colors } = useAppTheme();
  if (!status.open) {
    return (
      <View style={[styles.pill, styles.closed]}>
        <Text style={styles.closedText}>{t('library.closed')}</Text>
      </View>
    );
  }
  if (status.occupancy !== null) {
    const color = occupancyColor(colors, status.occupancy);
    return (
      <View style={styles.value}>
        <Text style={styles.percent}>{t('library.percent', { percent: status.occupancy })}</Text>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.min(status.occupancy, 100)}%`, backgroundColor: color }]} />
        </View>
      </View>
    );
  }
  if (status.flow) return <Text style={styles.flow}>{t(FLOW_LABEL[status.flow])}</Text>;
  return <Text style={styles.muted}>{t('library.open')}</Text>;
}

function a11yLabel(name: string, status: LibraryStatus | null) {
  if (!status) return `${name}: ${t('common.loading')}`;
  const parts = [name, status.open ? t('library.open') : t('library.closed'), hoursLabel(status)];
  if (status.open && status.occupancy !== null) parts.push(t('library.a11yOccupancy', { percent: status.occupancy }));
  else if (status.open && status.flow) parts.push(t(FLOW_LABEL[status.flow]));
  return parts.join(', ');
}

const useStyles = makeStyles((c) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10 },
  divider: { borderTopWidth: 1, borderColor: c.gridLine },
  body: { flex: 1, gap: 1 },
  name: { fontSize: 14, fontWeight: '600', color: c.text },
  muted: { fontSize: 12, color: c.textMuted },
  value: { alignItems: 'flex-end', gap: 4 },
  percent: { fontSize: 20, fontWeight: '800', color: c.text, fontVariant: ['tabular-nums'] },
  track: { width: 64, height: 4, borderRadius: 2, backgroundColor: c.gridLine, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
  flow: { fontSize: 14, fontWeight: '700', color: c.text },
  pill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'center' },
  closed: { backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border },
  closedText: { color: c.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
}));
