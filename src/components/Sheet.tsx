// Minimal cross-platform modal: centred card on wide screens, bottom sheet on phones.
import { useEffect, useState, type ReactNode } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { makeStyles } from '../lib/theme';
import { t } from '../lib/i18n';

/** `avoidKeyboard`: lift the sheet above the keyboard (sheets with a text field). */
type Props = { visible: boolean; onClose: () => void; children: ReactNode; avoidKeyboard?: boolean };

/** Height of the on-screen keyboard while `enabled` (0 when hidden). */
function useKeyboardHeight(enabled: boolean) {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [enabled]);
  return enabled ? height : 0;
}

export function Sheet({ visible, onClose, children, avoidKeyboard }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const wide = width >= 768;
  const styles = useStyles();
  const keyboard = useKeyboardHeight(!!avoidKeyboard && visible);
  // iOS: KeyboardAvoidingView lifts the sheet. Android: the modal window isn't resized
  // for the keyboard (the sheet would stay behind it), so pad it by the keyboard height.
  const androidKeyboard = Platform.OS === 'android' ? keyboard : 0;
  // Keep the whole sheet on screen above the keyboard (its list shrinks).
  const maxHeight = height - keyboard - insets.top - 16;

  return (
    <Modal visible={visible} transparent animationType={wide ? 'fade' : 'slide'} onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[styles.backdrop, wide ? styles.center : styles.bottom, androidKeyboard > 0 && { paddingBottom: androidKeyboard }]}
        behavior={avoidKeyboard && Platform.OS === 'ios' ? 'padding' : undefined}
        enabled={!!avoidKeyboard && Platform.OS === 'ios'}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t('common.close')} />
        <View
          style={[
            styles.card,
            avoidKeyboard && { maxHeight },
            wide ? styles.cardWide : [styles.cardSheet, { paddingBottom: keyboard > 0 ? 12 : insets.bottom + 12 }],
          ]}
        >
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  backdrop: { flex: 1, backgroundColor: c.backdrop },
  center: { alignItems: 'center', justifyContent: 'center', padding: 16 },
  bottom: { justifyContent: 'flex-end' },
  card: { backgroundColor: c.bg, padding: 12 },
  cardWide: { width: 360, maxWidth: '100%', borderRadius: 12 },
  cardSheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16 },
}));
