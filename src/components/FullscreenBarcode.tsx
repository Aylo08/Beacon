// Full-screen barcode for scanners: white background, screen at max brightness
// while it is shown (restored on close and whenever the app leaves the foreground).
import { useEffect } from 'react';
import { AppState, Modal, Platform, Pressable, StatusBar, Text, useWindowDimensions, View } from 'react-native';
import * as Brightness from 'expo-brightness';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Barcode } from './Barcode';
import { Icon } from './Icon';
import { t } from '../lib/i18n';

/** Screen at full brightness while `active` (restored on close and when the app leaves the foreground). */
export function useMaxBrightness(active: boolean) {
  useEffect(() => {
    if (!active) return;
    let previous: number | null = null;
    const raise = async () => {
      try {
        previous ??= await Brightness.getBrightnessAsync();
        await Brightness.setBrightnessAsync(1);
      } catch {}
    };
    const restore = async () => {
      try {
        // Android: drop the per-screen override. iOS: the change is global until lock, so put the old value back.
        if (Platform.OS === 'android') await Brightness.restoreSystemBrightnessAsync();
        else if (previous !== null) await Brightness.setBrightnessAsync(previous);
        previous = null;
      } catch {}
    };
    raise();
    const sub = AppState.addEventListener('change', (s) => (s === 'active' ? raise() : restore()));
    return () => {
      sub.remove();
      restore();
    };
  }, [active]);
}

export function FullscreenBarcode({
  value,
  caption,
  visible,
  onClose,
}: {
  value: string;
  caption?: string;
  visible: boolean;
  onClose: () => void;
}) {
  useMaxBrightness(visible);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Keep a quiet zone of at least 10 modules on each side (Code 128 is ~101 modules wide here).
  const barWidth = Math.min(width - 64, 560);

  return (
    <Modal visible={visible} animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose}>
      <StatusBar hidden />
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('card.closeBarcode')}
        style={{ flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', gap: 20 }}
      >
        <View style={{ position: 'absolute', top: insets.top + 12, right: insets.right + 16 }}>
          <Icon name="close-line" size={28} color="#6b7280" />
        </View>
        {caption && <Text style={{ fontSize: 18, fontWeight: '700', color: '#111' }}>{caption}</Text>}
        <Barcode value={value} width={barWidth} height={barWidth * 0.4} />
        <Text style={{ fontSize: 22, letterSpacing: 3, color: '#111', fontVariant: ['tabular-nums'] }}>{value}</Text>
        <Text style={{ fontSize: 13, color: '#6b7280', position: 'absolute', bottom: insets.bottom + 24 }}>
          {t('card.tapToClose')}
        </Text>
      </Pressable>
    </Modal>
  );
}
