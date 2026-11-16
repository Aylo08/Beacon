// Digital student card. The data comes from the ENT (see EntCardFetcher) and is
// cached on the device so the card shows offline: text fields in SecureStore,
// the photo as a file in the app's document directory.
import { fetch } from 'expo/fetch';
import { File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';

/** Raw response of https://ent.univ-avignon.fr/EtiquetteUserUapv/getInfoUser */
export type EntInfoUser = {
  uid: string;
  nom: string;
  prenom: string;
  ine?: string;
  dateNaissance?: string;
  lieuNaissance?: string;
  mel?: string;
  diplomes?: { inscription?: { libelle: string; annee: string }[] };
  supannAffectation?: string;
  supannCodePopulation?: string;
  photo_visible?: boolean;
  photo_path?: string;
};

export type StudentCard = {
  lastName: string;
  firstName: string;
  /** Student number ("n° AU"), e.g. 2701460. */
  number: string;
  ine: string;
  /** ISO date (YYYY-MM-DD) or empty. */
  birthDate: string;
  /** Academic year as given by the ENT, e.g. "2026-2027". */
  year: string;
  /** file:// URI of the cached photo, or null. */
  photoUri: string | null;
  fetchedAt: number;
};

const KEY = 'student_card';
const photoFile = () => new File(Paths.document, 'student-photo.jpg');

/** Barcode content: "90" followed by the student number. */
export const barcodeValue = (card: StudentCard) => `90${card.number}`;

/** "2026-2027" → "2026 - 2027"; falls back to the current academic year. */
export function yearLabel(card: StudentCard) {
  if (card.year) return card.year.replace(/\s*-\s*/, ' - ');
  const now = new Date();
  const start = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return `${start} - ${start + 1}`;
}

export async function loadStudentCard(): Promise<StudentCard | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return null;
    const card = JSON.parse(raw) as StudentCard;
    // The document directory path can change between app updates on iOS: resolve it again.
    const file = photoFile();
    return { ...card, photoUri: card.photoUri && file.exists ? `${file.uri}?v=${card.fetchedAt}` : null };
  } catch {
    return null;
  }
}

/**
 * Saves the ENT response. `photoDataUrl` is the photo as read by the WebView
 * (null if it couldn't be read there); otherwise we download it directly.
 */
export async function saveStudentCard(info: EntInfoUser, photoDataUrl: string | null): Promise<StudentCard> {
  const fetchedAt = Date.now();
  const inscriptions = info.diplomes?.inscription ?? [];
  const years = inscriptions.map((i) => i.annee?.trim()).filter(Boolean).sort();

  let hasPhoto = false;
  const file = photoFile();
  if (info.photo_visible !== false && info.photo_path) {
    try {
      const base64 = photoDataUrl?.split(',')[1];
      if (base64) {
        await file.write(base64, { encoding: 'base64' });
      } else {
        const res = await fetch(info.photo_path);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await file.write(await res.bytes());
      }
      hasPhoto = true;
    } catch {
      // Keep the previously cached photo, if any.
      hasPhoto = file.exists;
    }
  }

  const card: StudentCard = {
    lastName: info.nom?.trim() ?? '',
    firstName: info.prenom?.trim() ?? '',
    number: info.uid.replace(/^\D+/, ''),
    ine: info.ine?.trim() ?? '',
    birthDate: info.dateNaissance?.trim() ?? '',
    year: years.at(-1) ?? '',
    photoUri: hasPhoto ? file.uri : null,
    fetchedAt,
  };
  await SecureStore.setItemAsync(KEY, JSON.stringify(card));
  return { ...card, photoUri: hasPhoto ? `${file.uri}?v=${fetchedAt}` : null };
}

/** Removes the cached card (on logout). */
export async function clearStudentCard() {
  try {
    await SecureStore.deleteItemAsync(KEY);
    const file = photoFile();
    if (file.exists) file.delete();
  } catch {
    // Nothing cached, or storage unavailable.
  }
}
