// Dev-only "erase everything" (Réglages → Développement): puts the device back to a fresh install.
// - server: deletes this install's statistics (and any queued opt-out); IDs the server couldn't be
//   reached for are re-queued after the wipe, so they're still deleted on a later launch;
// - device: every keychain item, every file in the document and cache folders, the native cookie jar
//   used by fetch (the WebViews are incognito, so they keep nothing);
// The caller then reloads the app: in-memory state is gone and the onboarding starts over.
import { Directory, File, Paths } from 'expo-file-system';
import { forgetInstallOnServer, requeueServerDeletes } from '../lib/analytics';
import { wipeStorage } from '../lib/storage';

/** Resolves to the number of server deletions still pending (server unreachable). */
export async function wipeAllData(): Promise<number> {
  const pending = await forgetInstallOnServer();
  await wipeStorage();
  for (const dir of [Paths.document, Paths.cache]) emptyDirectory(dir);
  await clearCookies();
  await requeueServerDeletes(pending);
  return pending.length;
}

function emptyDirectory(dir: Directory) {
  try {
    for (const item of dir.list()) {
      try {
        if (item instanceof File || item instanceof Directory) item.delete();
      } catch {
        // In use / not ours: skip it.
      }
    }
  } catch {
    // Folder unreadable: nothing to delete.
  }
}

function clearCookies() {
  // Not exported by `react-native`'s public API: deep import, dev-only code.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { default: Networking } = require('react-native/Libraries/Network/RCTNetworking') as {
    default?: { clearCookies?: (cb: (cleared: boolean) => void) => void };
  };
  return new Promise<void>((resolve) => {
    if (!Networking?.clearCookies) return resolve();
    Networking.clearCookies(() => resolve());
  });
}
