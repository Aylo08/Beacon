// Full-screen Izly payment QR code: requested from Izly each time it opens (codes
// are short-lived), shown on white at max brightness with a countdown; a new one
// can be asked for once it expires.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StatusBar, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createIzlyQrCode, type IzlyQrCode } from '../../lib/izly';
import { formatMinutes, parisParts } from '../../lib/time';
import { BRAND } from '../../lib/theme';
import { useNow } from '../../lib/useLive';
import { useMaxBrightness } from '../FullscreenBarcode';
import { Icon } from '../Icon';
import { t } from '../../lib/i18n';

const IZLY_RED = BRAND.izly;

type State = { status: 'loading' } | { status: 'ready'; qr: IzlyQrCode } | { status: 'error'; message: string };

export function QrPayModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  useMaxBrightness(visible);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [request, setRequest] = useState(0);
  const now = useNow(1000, visible && state.status === 'ready');

  useEffect(() => {
    if (!visible) return;
    let active = true;
    createIzlyQrCode().then(
      (qr) => active && setState({ status: 'ready', qr }),
      (e) => active && setState({ status: 'error', message: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      active = false;
    };
  }, [visible, request]);

  const renew = () => {
    setState({ status: 'loading' });
    setRequest((n) => n + 1);
  };
  const close = () => {
    onClose();
    setState({ status: 'loading' }); // never show a stale code next time
  };

  const size = Math.min(width - 64, 340);
  const left = state.status === 'ready' && state.qr.validUntil != null ? state.qr.validUntil - now : null;
  const expired = left != null && left <= 0;

  return (
    <Modal visible={visible} animationType="fade" presentationStyle="fullScreen" onRequestClose={close}>
      <StatusBar hidden />
      <View style={{ flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', gap: 20, padding: 24 }}>
        <Pressable
          onPress={close}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('qr.close')}
          style={{ position: 'absolute', top: insets.top + 12, right: insets.right + 16 }}
        >
          <Icon name="close-line" size={28} color="#6b7280" />
        </Pressable>

        <Text style={{ fontSize: 20, fontWeight: '800', color: '#111' }}>{t('qr.title')}</Text>

        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          {state.status === 'loading' && <ActivityIndicator color="#6b7280" />}
          {state.status === 'error' && <Text style={{ color: '#c0392b', textAlign: 'center' }}>{state.message}</Text>}
          {state.status === 'ready' && (
            <Image
              source={{ uri: state.qr.uri }}
              style={{ width: size, height: size, opacity: expired ? 0.12 : 1 }}
              resizeMode="contain"
              accessibilityLabel={t('qr.a11y')}
            />
          )}
        </View>

        {state.status === 'ready' && state.qr.validUntil != null && left != null && (
          <View style={{ alignItems: 'center', gap: 4 }} accessibilityLiveRegion="polite">
            <Text style={{ fontSize: 17, fontWeight: '600', color: expired ? '#c0392b' : '#111', fontVariant: ['tabular-nums'] }}>
              {expired ? t('qr.expired') : t('qr.expiresIn', { left: formatLeft(left) })}
            </Text>
            <Text style={{ fontSize: 13, color: '#6b7280' }}>
              {expired ? t('qr.askNew') : t('qr.validUntil', { time: clockTime(state.qr.validUntil) })}
            </Text>
          </View>
        )}

        {(expired || state.status === 'error') && (
          <Pressable
            onPress={renew}
            accessibilityRole="button"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: IZLY_RED, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8 }}
          >
            <Icon name="refresh-line" size={18} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>{t('qr.new')}</Text>
          </Pressable>
        )}

        <Text style={{ fontSize: 13, color: '#6b7280', position: 'absolute', bottom: insets.bottom + 24, textAlign: 'center' }}>
          {t('qr.present')}
        </Text>
      </View>
    </Modal>
  );
}

/** "4 min 32 s", "45 s", "1 h 05 min" */
function formatLeft(ms: number) {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return t('duration.qrHours', { h, mm: String(m).padStart(2, '0') });
  if (m > 0) return t('duration.qrMinutes', { m, ss: String(s % 60).padStart(2, '0') });
  return t('duration.qrSeconds', { s });
}

/** Paris "00:09" */
const clockTime = (epoch: number) => formatMinutes(parisParts(new Date(epoch)).minutes);
