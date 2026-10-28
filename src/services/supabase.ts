import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const rawUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://placeholder-project.supabase.co';
const SUPABASE_URL = rawUrl.trim().replace(/\/+$/, '');
const SUPABASE_ANON_KEY = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key').trim();

const SecureStoreAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      if (Platform.OS === 'web') {
        return typeof window !== 'undefined' ? sessionStorage.getItem(key) : null;
      }
      return await SecureStore.getItemAsync(key);
    } catch {
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
      await SecureStore.setItemAsync(key, value, {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
      });
    } catch {}
  },

  removeItem: async (key: string): Promise<void> => {
    try {
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem(key);
        }
        return;
      }
      await SecureStore.deleteItemAsync(key);
    } catch {}
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: SecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export const checkSupabaseConnection = async (): Promise<{
  connected: boolean;
  url: string;
  isConfigured: boolean;
  message: string;
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
    };
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      method: 'GET',
      headers: {
        apikey: SUPABASE_ANON_KEY,
      },
    });

    if (response.ok) {
      return {
        connected: true,
        url: SUPABASE_URL,
        isConfigured: true,
        message: 'Połączono z usługą autoryzacji.',
      };
    }
    return {
      connected: false,
      url: SUPABASE_URL,
      isConfigured: true,
      message: `Status serwera: ${response.status}`,
    };
  } catch (error: any) {
    return {
      connected: false,
      url: SUPABASE_URL,
      isConfigured: true,
      message: error?.message || 'Brak łączności sieciowej.',
    };
  }
};
