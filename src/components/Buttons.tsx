// Small shared controls: icon button, theme toggle (cycling) and theme picker (segmented).
import { Pressable, Text, View } from 'react-native';
import { makeStyles, useAppTheme, type ThemeMode } from '../lib/theme';
import { Icon, type IconName } from './Icon';

export function IconButton({
  icon,
  label,
  onPress,
  color,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  color?: string;
}) {
  const styles = useStyles();
  const { colors } = useAppTheme();
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={label} style={styles.iconButton}>
      <Icon name={icon} size={22} color={color ?? colors.primary} />
    </Pressable>
  );
}

const THEMES: { mode: ThemeMode; icon: IconName; label: string; next: ThemeMode }[] = [
  { mode: 'auto', icon: 'contrast-2-line', label: 'Auto', next: 'light' },
  { mode: 'light', icon: 'sun-line', label: 'Clair', next: 'dark' },
  { mode: 'dark', icon: 'moon-line', label: 'Sombre', next: 'auto' },
];

/** Compact toggle cycling auto → light → dark (used where space is tight). */
export function ThemeToggle() {
  const { mode, setMode, colors } = useAppTheme();
  const t = THEMES.find((x) => x.mode === mode)!;
  return (
    <IconButton
      icon={t.icon}
      label={`Thème : ${t.label} (changer)`}
      onPress={() => setMode(t.next)}
      color={colors.textSecondary}
    />
  );
}

/** Segmented Auto / Clair / Sombre picker. */
export function ThemePicker() {
  const { mode, setMode, colors } = useAppTheme();
  const styles = useStyles();
  return (
    <View style={styles.segmented} accessibilityRole="radiogroup">
      {THEMES.map((t) => {
        const selected = t.mode === mode;
        return (
          <Pressable
            key={t.mode}
            onPress={() => setMode(t.mode)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            style={[styles.segment, selected && styles.segmentSelected]}
          >
            <Icon name={t.icon} size={16} color={selected ? colors.inverseText : colors.textSecondary} />
            <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  iconButton: { padding: 4 },
  segmented: { flexDirection: 'row', backgroundColor: c.surfaceAlt, borderRadius: 10, padding: 3, gap: 3 },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
  },
  segmentSelected: { backgroundColor: c.inverseBg },
  segmentText: { fontSize: 14, color: c.textSecondary },
  segmentTextSelected: { color: c.inverseText, fontWeight: '600' },
}));
