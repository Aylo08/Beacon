// Minimal cross-platform modal: centred card on wide screens, bottom sheet on phones.
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { makeStyles } from '../lib/theme';
import { t } from '../lib/i18n';

/** `avoidKeyboard`: lift the sheet above the keyboard (sheets with a text field). */
type Props = { visible: boolean; onClose: () => void; children: ReactNode; avoidKeyboard?: boolean };

export function Sheet({ visible, onClose, children, avoidKeyboard }: Props) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const wide = width >= 768;
  const styles = useStyles();

  return (
    <Modal visible={visible} transparent animationType={wide ? 'fade' : 'slide'} onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[styles.backdrop, wide ? styles.center : styles.bottom]}
        behavior={avoidKeyboard && Platform.OS === 'ios' ? 'padding' : undefined}
        enabled={!!avoidKeyboard}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t('common.close')} />
        <View style={[styles.card, wide ? styles.cardWide : [styles.cardSheet, { paddingBottom: insets.bottom + 12 }]]}>
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
