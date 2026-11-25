import { supabase } from './supabase';

export const DAILY_LIMIT_OPTIONS = [500, 1000, 2000, 5000, 10000, 20000, 50000] as const;

export type DailyLimitOption = (typeof DAILY_LIMIT_OPTIONS)[number];

export type DailyLimitResult =
  | { status: 'ok'; limit: number }
  | { status: 'pin_required' }
  | { status: 'pin_invalid'; attemptsLeft: number; reset: boolean };

export const formatLimit = (value: number): string =>
  `${value.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PLN`;

const mapLimitError = (message?: string): string => {
  if (!message) return 'Nie udało się zmienić limitu.';
  if (message.includes('invalid_daily_limit')) return 'Wybrana wartość limitu jest niedozwolona.';
  if (message.includes('account_not_found')) return 'Nie znaleziono rachunku.';
  if (message.includes('not_authorized')) return 'Sesja wygasła lub została zakończona. Zaloguj się ponownie.';
  if (/could not find the function|schema cache/i.test(message)) {
    return 'Zmiana limitu jest chwilowo niedostępna. Spróbuj ponownie później.';
  }
  if (/network|fetch/i.test(message)) return 'Brak połączenia z serwerem.';
  return 'Nie udało się zmienić limitu.';
};

export const setDailyLimit = async (limit: DailyLimitOption, pin?: string): Promise<DailyLimitResult> => {
  if (!DAILY_LIMIT_OPTIONS.includes(limit)) {
    throw new Error(mapLimitError('invalid_daily_limit'));
  }
  const { data, error } = await supabase.rpc('set_daily_limit', { new_limit: limit, p_pin: pin ?? null });
  if (error) {
    throw new Error(mapLimitError(error.message));
  }
  if (data?.status === 'pin_required') return { status: 'pin_required' };
  if (data?.status === 'pin_invalid') {
    return { status: 'pin_invalid', attemptsLeft: Number(data.attempts_left ?? 0), reset: !!data.reset };
  }
  return { status: 'ok', limit: Number(data?.limit) };
};
