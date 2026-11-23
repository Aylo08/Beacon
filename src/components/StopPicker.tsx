// Bus stop picker: every stop of the kept lines, searchable (accent-, case- and
// space-insensitive), each with the lines serving it. `pinned` stops (home,
// campuses) come first, with their icon.
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { busStops, type Timetable } from '../lib/bus';
import { normalizeSearch } from '../lib/events';
import { t } from '../lib/i18n';
import { makeStyles, useAppTheme } from '../lib/theme';
import { Icon, type IconName } from './Icon';
import { Sheet } from './Sheet';

type Props = {
  visible: boolean;
  title: string;
  /** Selected stop name. */
  value: string | null;
  timetable: Timetable | null;
  /** Timetable loading error, shown instead of the list. */
  error?: string | null;
  /** Adds a "None" entry (onSelect(null)). */
  allowNone?: boolean;
  /** Stops listed first (and not again below), with an icon and a spoken label. */
  pinned?: PinnedStop[];
  onSelect: (name: string | null) => void;
  onClose: () => void;
};

export type PinnedStop = { name: string; icon: IconName; a11y: string };

export function StopPicker({ visible, title, value, timetable, error, allowNone, pinned, onSelect, onClose }: Props) {
  return (
    <Sheet visible={visible} onClose={onClose} avoidKeyboard>
      {/* Remount on open: the search starts empty each time. */}
      {visible && (
        <StopList
          title={title}
          value={value}
          timetable={timetable}
          error={error}
          allowNone={allowNone}
          pinned={pinned}
          onSelect={onSelect}
        />
      )}
    </Sheet>
  );
}

type Row = { name: string | null; lines: string[]; pin?: PinnedStop };

function StopList({ title, value, timetable, error, allowNone, pinned, onSelect }: Omit<Props, 'visible' | 'onClose'>) {
  const styles = useStyles();
  const { colors, scheme } = useAppTheme();
  const [query, setQuery] = useState('');
  const stops = useMemo(() => (timetable ? busStops(timetable) : []), [timetable]);
  const rows = useMemo<Row[]>(() => {
    const q = normalizeSearch(query);
    const found = q ? stops.filter((s) => normalizeSearch(s.name).includes(q)) : stops;
    // Pinned stops that exist in the timetable (and match the search), each once, then the rest.
    const top: Row[] = [];
    for (const pin of pinned ?? []) {
      const stop = found.find((s) => s.name === pin.name);
      if (stop && !top.some((row) => row.name === pin.name)) top.push({ ...stop, pin });
    }
    const rest = found.filter((s) => !top.some((row) => row.name === s.name));
    return [...(allowNone && !q ? [{ name: null, lines: [] }] : []), ...top, ...rest];
  }, [stops, query, allowNone, pinned]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.search}>
        <Icon name="search-line" size={18} color={colors.textMuted} />
        <TextInput
          style={styles.input}
          placeholder={t('bus.searchStop')}
          placeholderTextColor={colors.textFaint}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          keyboardAppearance={scheme}
          clearButtonMode="while-editing"
        />
      </View>
      {!timetable ? (
        error ? (
          <Text style={styles.empty}>{t('bus.unavailable', { error })}</Text>
        ) : (
          <ActivityIndicator color={colors.textMuted} style={styles.spinner} />
        )
      ) : (
        <FlatList
          style={styles.list}
          data={rows}
          keyExtractor={(r) => r.name ?? '__none__'}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={20}
          ListEmptyComponent={<Text style={styles.empty}>{t('bus.noStop')}</Text>}
          renderItem={({ item }) => {
            const selected = item.name === value;
            return (
              <Pressable
                onPress={() => onSelect(item.name)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={item.pin?.a11y}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
                {item.pin && <Icon name={item.pin.icon} size={18} color={selected ? colors.primary : colors.textSecondary} />}
                <Text style={[styles.label, selected && styles.selectedLabel]} numberOfLines={1}>
                  {item.name ?? t('common.none')}
                </Text>
                {item.lines.length > 0 && (
                  <Text style={styles.detail} numberOfLines={1}>
                    {item.lines.join(' · ')}
                  </Text>
                )}
                {selected && <Icon name="check-line" size={20} color={colors.primary} />}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  title: { fontSize: 16, fontWeight: '700', color: c.text, paddingHorizontal: 8, paddingBottom: 8 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 4,
    marginBottom: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: c.surfaceAlt,
  },
  input: { flex: 1, fontSize: 15, color: c.text, paddingVertical: 9 },
  // Shrinks with the sheet when the keyboard is open.
  wrap: { flexShrink: 1 },
  list: { maxHeight: 420, flexShrink: 1 },
  spinner: { marginVertical: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 8 },
  pressed: { backgroundColor: c.pressed },
  label: { flex: 1, fontSize: 15, color: c.text },
  selectedLabel: { fontWeight: '700', color: c.primary },
  detail: { fontSize: 13, color: c.textMuted, maxWidth: '45%' },
  empty: { fontSize: 14, color: c.textMuted, textAlign: 'center', paddingVertical: 24 },
}));
