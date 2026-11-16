// "Accueil": widgets + settings (theme, logout).
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemePicker } from '../../components/Buttons';
import { Icon } from '../../components/Icon';
import { usePersonalData } from '../../lib/personalData';
import { useSession } from '../../lib/sessionContext';
import { makeStyles, useAppTheme } from '../../lib/theme';
import { dayLabel, todayKey } from '../../lib/time';
import { WIDGETS, widgetById } from '../../widgets/registry';
import { useWidgetLayout } from '../../widgets/useWidgetLayout';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useAppTheme();
  const { signOut } = useSession();
  const { selected: favori } = usePersonalData();
  const { ids, add, remove, move } = useWidgetLayout();
  const [editing, setEditing] = useState(false);

  const available = WIDGETS.filter((w) => !ids.includes(w.id));

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 12, paddingLeft: insets.left + 16, paddingRight: insets.right + 16 },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.flexShrink}>
          <Text style={styles.title}>Accueil</Text>
          <Text style={styles.subtitle}>
            {dayLabel(todayKey())}
            {favori ? ` · ${favori.name}` : ''}
          </Text>
        </View>
        <Pressable
          onPress={() => setEditing((e) => !e)}
          accessibilityRole="button"
          accessibilityLabel={editing ? 'Terminer la modification des widgets' : 'Modifier les widgets'}
          style={[styles.editButton, editing && styles.editButtonActive]}
        >
          <Icon name={editing ? 'check-line' : 'pencil-line'} size={18} color={editing ? colors.inverseText : colors.textSecondary} />
          <Text style={[styles.editText, editing && styles.editTextActive]}>{editing ? 'Terminé' : 'Modifier'}</Text>
        </Pressable>
      </View>

      {/* Widgets */}
      {ids.map((id, index) => {
        const w = widgetById(id);
        if (!w) return null;
        return (
          <View key={id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Icon name={w.icon} size={18} color={colors.primary} />
              <Text style={styles.cardTitle}>{w.title}</Text>
              {editing && (
                <View style={styles.cardActions}>
                  <SmallButton icon="arrow-up-s-line" label="Monter" disabled={index === 0} onPress={() => move(id, -1)} />
                  <SmallButton
                    icon="arrow-down-s-line"
                    label="Descendre"
                    disabled={index === ids.length - 1}
                    onPress={() => move(id, 1)}
                  />
                  <SmallButton icon="close-line" label={`Retirer ${w.title}`} danger onPress={() => remove(id)} />
                </View>
              )}
            </View>
            <w.Component />
          </View>
        );
      })}

      {ids.length === 0 && !editing && (
        <Text style={styles.hint}>Aucun widget. Touchez « Modifier » pour en ajouter.</Text>
      )}

      {editing && (
        <View style={styles.card}>
          <Text style={[styles.cardTitle, styles.sectionPad]}>Ajouter un widget</Text>
          {available.length === 0 ? (
            <Text style={[styles.hint, styles.sectionPad]}>Tous les widgets disponibles sont déjà affichés.</Text>
          ) : (
            available.map((w) => (
              <Pressable
                key={w.id}
                onPress={() => add(w.id)}
                accessibilityRole="button"
                accessibilityLabel={`Ajouter ${w.title}`}
                style={({ pressed }) => [styles.addRow, pressed && styles.pressed]}
              >
                <Icon name={w.icon} size={20} color={colors.primary} />
                <View style={styles.flexShrink}>
                  <Text style={styles.addTitle}>{w.title}</Text>
                  <Text style={styles.hint}>{w.description}</Text>
                </View>
                <Icon name="add-line" size={22} color={colors.primary} />
              </Pressable>
            ))
          )}
        </View>
      )}

      {/* Settings */}
      <View style={[styles.card, styles.settings]}>
        <Text style={styles.cardTitle}>Thème</Text>
        <ThemePicker />
        <Pressable
          onPress={() => signOut()}
          accessibilityRole="button"
          style={({ pressed }) => [styles.logout, pressed && styles.pressed]}
        >
          <Icon name="logout-box-r-line" size={18} color={colors.danger} />
          <Text style={styles.logoutText}>Se déconnecter</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function SmallButton({
  icon,
  label,
  onPress,
  disabled,
  danger,
}: {
  icon: 'arrow-up-s-line' | 'arrow-down-s-line' | 'close-line';
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  const styles = useStyles();
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={[styles.smallButton, disabled && styles.disabled]}
    >
      <Icon name={icon} size={18} color={danger ? colors.danger : colors.textSecondary} />
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  flex: { flex: 1, backgroundColor: c.bg },
  flexShrink: { flexShrink: 1, flex: 1 },
  content: { gap: 14, paddingBottom: 24, width: '100%', maxWidth: 720, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 28, fontWeight: '800', color: c.text },
  subtitle: { fontSize: 14, color: c.textMuted, marginTop: 2 },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.border,
  },
  editButtonActive: { backgroundColor: c.inverseBg, borderColor: c.inverseBg },
  editText: { fontSize: 14, color: c.textSecondary },
  editTextActive: { color: c.inverseText, fontWeight: '600' },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    borderRadius: 14,
    backgroundColor: c.bg,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: c.surfaceAlt,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: c.text, flexShrink: 1 },
  cardActions: { flexDirection: 'row', gap: 4, marginLeft: 'auto' },
  smallButton: { padding: 4, borderRadius: 6 },
  disabled: { opacity: 0.3 },
  sectionPad: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 4 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 12 },
  addTitle: { fontSize: 14, fontWeight: '600', color: c.text },
  pressed: { backgroundColor: c.pressed },
  hint: { fontSize: 13, color: c.textMuted },
  settings: { padding: 12, gap: 12 },
  logout: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.danger,
  },
  logoutText: { color: c.danger, fontSize: 15, fontWeight: '600' },
}));
