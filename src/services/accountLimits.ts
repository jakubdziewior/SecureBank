import { supabase } from './supabase';

export const DAILY_LIMIT_OPTIONS = [500, 1000, 2000, 5000, 10000, 20000, 50000] as const;

export type DailyLimitOption = (typeof DAILY_LIMIT_OPTIONS)[number];

export const formatLimit = (value: number): string =>
  `${value.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PLN`;

const mapLimitError = (message?: string): string => {
  if (!message) return 'Nie udało się zmienić limitu.';
  if (message.includes('invalid_daily_limit')) return 'Wybrana wartość limitu jest niedozwolona.';
  if (message.includes('account_not_found')) return 'Nie znaleziono rachunku.';
  if (message.includes('not_authorized')) return 'Brak uprawnień. Zaloguj się ponownie.';
  if (/could not find the function|schema cache/i.test(message)) {
    return 'Zmiana limitu jest chwilowo niedostępna. Spróbuj ponownie później.';
  }
  if (/network|fetch/i.test(message)) return 'Brak połączenia z serwerem.';
  return 'Nie udało się zmienić limitu.';
};

export const setDailyLimit = async (limit: DailyLimitOption): Promise<number> => {
  if (!DAILY_LIMIT_OPTIONS.includes(limit)) {
    throw new Error(mapLimitError('invalid_daily_limit'));
  }
  const { data, error } = await supabase.rpc('set_daily_limit', { new_limit: limit });
  if (error) {
    throw new Error(mapLimitError(error.message));
  }
  return Number(data);
};
