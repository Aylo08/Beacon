// Language choice: System, or one of the classical languages no OS offers
// (each shown under its own name, whatever the current language).
import { CLASSICAL_LANGS, LANGUAGE_NAMES, setUserLang, t, useUserLang } from '../lib/i18n';
import { Segmented } from './Buttons';

export function LanguagePicker() {
  const userLang = useUserLang();
  return (
    <Segmented
      options={[
        { value: 'system', label: t('settings.languageSystem') },
        ...CLASSICAL_LANGS.map((l) => ({ value: l, label: LANGUAGE_NAMES[l] })),
      ]}
      value={userLang ?? 'system'}
      onChange={(v) => setUserLang(v === 'system' ? null : v)}
    />
  );
}
