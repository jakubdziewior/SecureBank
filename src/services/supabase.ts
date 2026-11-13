import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { decryptWithSessionKey, encryptWithSessionKey, isEncryptedValue } from './pin';
import {
  securePinnedFetch,
  verifySupabaseTlsChannel,
  AUTHORIZED_SPKI_PINS,
  SSLHandshakeException,
  getNetworkSecuritySummary,
} from './certificatePinning';

const rawUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://placeholder-project.supabase.co';
const SUPABASE_URL = rawUrl.trim().replace(/\/+$/, '');
const SUPABASE_ANON_KEY = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key').trim();

const CHUNK_SIZE = 1800;
const CHUNK_MARKER = '__chunked__:';
const SESSION_STORAGE_KEY = 'securebank.session';

const secureOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const chunkKey = (key: string, index: number) => `${key}.${index}`;

const logStorageError = (operation: string, error: unknown) => {
  if (__DEV__) {
    console.warn(`[SecureStore] ${operation} nie powiodło się:`, error);
  }
};

const readChunkCount = async (key: string): Promise<number> => {
  const header = await SecureStore.getItemAsync(key, secureOptions);
  return header?.startsWith(CHUNK_MARKER) ? parseInt(header.slice(CHUNK_MARKER.length), 10) || 0 : 0;
};

const removeChunks = async (key: string, fromIndex = 0) => {
  const count = await readChunkCount(key);
  for (let i = fromIndex; i < count; i++) {
    await SecureStore.deleteItemAsync(chunkKey(key, i), secureOptions);
  }
};

const readRaw = async (key: string): Promise<string | null> => {
  const header = await SecureStore.getItemAsync(key, secureOptions);
  if (!header?.startsWith(CHUNK_MARKER)) {
    return header;
  }
  const count = parseInt(header.slice(CHUNK_MARKER.length), 10) || 0;
  const parts: string[] = [];
  for (let i = 0; i < count; i++) {
    const part = await SecureStore.getItemAsync(chunkKey(key, i), secureOptions);
    if (part === null) {
      return null;
    }
    parts.push(part);
  }
  return parts.join('');
};

const writeRaw = async (key: string, value: string): Promise<void> => {
  const count = Math.ceil(value.length / CHUNK_SIZE);
  await removeChunks(key, count);
  for (let i = 0; i < count; i++) {
    await SecureStore.setItemAsync(chunkKey(key, i), value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE), secureOptions);
  }
  await SecureStore.setItemAsync(key, `${CHUNK_MARKER}${count}`, secureOptions);
};

const removeRaw = async (key: string): Promise<void> => {
  await removeChunks(key);
  await SecureStore.deleteItemAsync(key, secureOptions);
};

const pendingValues = new Map<string, string>();

const SecureStoreAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      if (Platform.OS === 'web') {
        return typeof window !== 'undefined' ? sessionStorage.getItem(key) : null;
      }
      const pending = pendingValues.get(key);
      if (pending !== undefined) {
        return pending;
      }
      const raw = await readRaw(key);
      if (raw && isEncryptedValue(raw)) {
        return decryptWithSessionKey(raw);
      }
      return raw;
    } catch (error) {
      logStorageError('Odczyt', error);
      return null;
    }
  },

  setItem: async (key: string, value: string): Promise<void> => {
    try {
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') {
          sessionStorage.setItem(key, value);
        }
        return;
      }
      const encrypted = encryptWithSessionKey(value);
      if (encrypted) {
        pendingValues.delete(key);
        await writeRaw(key, encrypted);
      } else {
        // Zgodnie z D3/K1: do chwili utworzenia i odblokowania skarbca PIN sesja
        // jest trzymana wylacznie w pamieci RAM (pendingValues).
        // Nigdy nie zapisujemy nieszyfrowanej sesji bez warstwy 'enc1:' do SecureStore.xml.
        pendingValues.set(key, value);
      }
    } catch (error) {
      logStorageError('Zapis', error);
    }
  },

  removeItem: async (key: string): Promise<void> => {
    try {
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem(key);
        }
        return;
      }
      pendingValues.delete(key);
      await removeRaw(key);
    } catch (error) {
      logStorageError('Usuwanie', error);
    }
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: SecureStoreAdapter,
    storageKey: SESSION_STORAGE_KEY,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  global: {
    headers: {
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
    },
    fetch: securePinnedFetch,
  },
});

export const resealStoredSession = async (): Promise<void> => {
  if (Platform.OS === 'web') return;
  const pending = pendingValues.get(SESSION_STORAGE_KEY);
  const raw = pending ?? (await readRaw(SESSION_STORAGE_KEY));
  if (!raw || isEncryptedValue(raw)) return;
  const encrypted = encryptWithSessionKey(raw);
  if (encrypted) {
    await writeRaw(SESSION_STORAGE_KEY, encrypted);
    pendingValues.delete(SESSION_STORAGE_KEY);
  }
};

export const hasEncryptedStoredSession = async (): Promise<boolean> => {
  if (Platform.OS === 'web') return false;
  const raw = await readRaw(SESSION_STORAGE_KEY);
  return !!raw && isEncryptedValue(raw);
};

export const discardPendingSession = () => {
  pendingValues.clear();
};

export const clearStoredSession = async (): Promise<void> => {
  if (Platform.OS === 'web') return;
  pendingValues.clear();
  try {
    await removeRaw(SESSION_STORAGE_KEY);
  } catch (error) {
    logStorageError('Usuwanie', error);
  }
};

export const checkSupabaseConnection = async (): Promise<{
  connected: boolean;
  url: string;
  isConfigured: boolean;
  message: string;
  pinningActive: boolean;
  spkiPinsCount: number;
}> => {
  const isConfigured =
    SUPABASE_URL !== 'https://placeholder-project.supabase.co' &&
    SUPABASE_ANON_KEY !== 'placeholder-anon-key';

  if (!isConfigured) {
    return {
      connected: false,
      url: SUPABASE_URL,
      isConfigured: false,
      message: 'Brak konfiguracji połączenia w zmiennych środowiskowych.',
      pinningActive: true,
      spkiPinsCount: AUTHORIZED_SPKI_PINS.length,
    };
  }

  try {
    const result = await verifySupabaseTlsChannel(SUPABASE_URL, SUPABASE_ANON_KEY);
    return {
      connected: result.success,
      url: SUPABASE_URL,
      isConfigured: true,
      message: result.message,
      pinningActive: true,
      spkiPinsCount: result.pins.length,
    };
  } catch (error: any) {
    return {
      connected: false,
      url: SUPABASE_URL,
      isConfigured: true,
      message: error?.message || 'Brak łączności sieciowej.',
      pinningActive: true,
      spkiPinsCount: AUTHORIZED_SPKI_PINS.length,
    };
  }
};

export { getNetworkSecuritySummary, SSLHandshakeException };
