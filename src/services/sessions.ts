import { supabase } from './supabase';

export interface ActiveSession {
  id: string;
  createdAt: string;
  lastActive: string;
  userAgent: string | null;
  current: boolean;
}

export const listActiveSessions = async (): Promise<ActiveSession[]> => {
  const { data, error } = await supabase.rpc('my_sessions');
  if (error) {
    throw new Error('Nie udało się pobrać listy sesji.');
  }
  return (Array.isArray(data) ? data : []).map((row: any) => ({
    id: String(row.id),
    createdAt: String(row.created_at),
    lastActive: String(row.last_active),
    userAgent: row.user_agent ?? null,
    current: !!row.current,
  }));
};

export const signOutOtherSessions = async (): Promise<void> => {
  const { error } = await supabase.auth.signOut({ scope: 'others' });
  if (error) {
    throw new Error('Nie udało się wylogować pozostałych urządzeń.');
  }
};

export const describeUserAgent = (userAgent: string | null): string => {
  if (!userAgent) return 'Nieznane urządzenie';
  if (/okhttp|android/i.test(userAgent)) return 'Android';
  if (/iphone|ipad|ios|darwin|cfnetwork/i.test(userAgent)) return 'iOS';
  if (/mozilla|chrome|safari|firefox/i.test(userAgent)) return 'Przeglądarka';
  return 'Aplikacja SecureBank';
};
