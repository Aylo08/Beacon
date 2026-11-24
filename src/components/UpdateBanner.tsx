// Home screen, above the widgets: "Beacon X is available" with Later / Update, then the download
// progress, then a retry button if it failed. Shown by the automatic check (`src/lib/appUpdate.ts`);
// renders nothing otherwise.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from './Icon';
import { dismissUpdateBanner, installUpdate, useUpdateBanner } from '../lib/appUpdate';
import { t } from '../lib/i18n';
import { makeStyles, useAppTheme } from '../lib/theme';

export function UpdateBanner() {
  const styles = useStyles();
  const { colors } = useAppTheme();
  const banner = useUpdateBanner();
  if (!banner) return null;
  const { status, release } = banner;
  const downloading = status.kind === 'downloading';
  const percent = downloading ? Math.round(status.progress * 100) : 0;

  return (
    <View style={styles.banner} accessibilityRole="summary">
      <View style={styles.header}>
        <Icon name="refresh-line" size={20} color={colors.infoText} />
        <Text style={styles.title}>{t('update.title')}</Text>
      </View>
      <Text style={styles.text}>
        {status.kind === 'error'
          ? t('update.failed')
          : t('update.message', { version: release.version, size: Math.max(1, Math.round(release.size / 1e6)) })}
      </Text>
      {downloading ? (
        <View style={styles.progressBlock} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: percent }}>
          <Text style={styles.text}>{t('settings.updateDownloading', { percent })}</Text>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${status.progress * 100}%` }]} />
          </View>
        </View>
      ) : (
        <View style={styles.actions}>
          <Pressable
            onPress={dismissUpdateBanner}
            accessibilityRole="button"
            style={({ pressed }) => [styles.button, styles.secondary, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryText}>{t('update.later')}</Text>
          </Pressable>
          <Pressable
            onPress={() => installUpdate(release)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.button, styles.primary, pressed && styles.pressed]}
          >
            <Text style={styles.primaryText}>{t('update.install')}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  banner: {
    backgroundColor: c.infoBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.infoBorder,
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 16, fontWeight: '700', color: c.infoText, flexShrink: 1 },
  text: { fontSize: 14, color: c.infoText, opacity: 0.85 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  button: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999 },
  secondary: { borderWidth: 1, borderColor: c.infoBorder },
  secondaryText: { fontSize: 14, fontWeight: '600', color: c.infoText },
  primary: { backgroundColor: c.infoButton },
  primaryText: { fontSize: 14, fontWeight: '700', color: c.onInfoButton },
  pressed: { opacity: 0.7 },
  progressBlock: { gap: 6 },
  track: { height: 6, borderRadius: 3, backgroundColor: c.infoBorder, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: c.infoButton },
}));
