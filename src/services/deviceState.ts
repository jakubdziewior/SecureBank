import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { clearStoredSession } from './supabase';
import { deletePinVault } from './pin';

const INSTALL_FLAG_NAME = 'securebank.installed';

export const clearAppCache = async (): Promise<void> => {
  if (Platform.OS === 'web') return;
  try {
    for (const entry of Paths.cache.list()) {
      try {
        entry.delete();
      } catch {}
    }
  } catch {}
};

export const wipeLocalSessionData = async (): Promise<void> => {
  await clearStoredSession();
  await deletePinVault();
  await clearAppCache();
};

export const ensureFreshInstallState = async (): Promise<void> => {
  if (Platform.OS === 'web') return;
  try {
    const flag = new File(Paths.document, INSTALL_FLAG_NAME);
    if (flag.exists) return;
    await wipeLocalSessionData();
    flag.create();
    await flag.write('1');
  } catch {}
};
