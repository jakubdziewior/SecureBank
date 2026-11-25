import { supabase } from './supabase';

export type LoginResolution =
  | { status: 'ok'; email: string }
  | { status: 'invalid'; attemptsLeft: number | null }
  | { status: 'locked'; retryAfterSeconds: number };

export const resolveLogin = async (login: string, password: string): Promise<LoginResolution> => {
  const { data, error } = await supabase.rpc('resolve_login', { p_login: login, p_password: password });
  if (error) {
    if (/could not find the function|schema cache/i.test(error.message)) {
      throw new Error('Logowanie jest chwilowo niedostępne. Spróbuj ponownie później.');
    }
    if (/network|fetch/i.test(error.message)) {
      throw new Error('Brak połączenia z serwerem.');
    }
    throw new Error('Błąd uwierzytelniania.');
  }
  if (data?.status === 'ok' && data.email) {
    return { status: 'ok', email: String(data.email) };
  }
  if (data?.status === 'locked') {
    return { status: 'locked', retryAfterSeconds: Number(data.retry_after ?? 900) };
  }
  return { status: 'invalid', attemptsLeft: data?.attempts_left ?? null };
};

export const formatLockout = (seconds: number): string => {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `Zbyt wiele nieudanych prób logowania. Spróbuj ponownie za ${minutes} min.`;
};
