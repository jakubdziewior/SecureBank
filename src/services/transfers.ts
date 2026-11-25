import * as Crypto from 'expo-crypto';
import { supabase } from './supabase';

export type TransferResult =
  | { status: 'ok'; transactionId: string; balance: number; internal: boolean; duplicate: boolean }
  | { status: 'pin_invalid'; attemptsLeft: number; reset: boolean };

const formatPln = (value: number): string =>
  `${value.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PLN`;

const mapTransferError = (message?: string): string => {
  if (!message) return 'Nie udało się wykonać przelewu.';
  const limitMatch = message.match(/daily_limit_exceeded:([\d.]+)/);
  if (limitMatch) {
    return `Przekroczono dzienny limit operacji. Dziś możesz jeszcze przelać ${formatPln(Number(limitMatch[1]))}.`;
  }
  if (message.includes('insufficient_funds')) return 'Brak wystarczających środków na rachunku.';
  if (message.includes('invalid_account_number')) return 'Numer rachunku jest nieprawidłowy.';
  if (message.includes('same_account')) return 'Nie możesz wykonać przelewu na własny rachunek.';
  if (message.includes('invalid_amount')) return 'Podaj poprawną kwotę.';
  if (message.includes('missing_fields')) return 'Uzupełnij nazwę odbiorcy i tytuł przelewu.';
  if (message.includes('account_not_found')) return 'Nie znaleziono rachunku nadawcy.';
  if (message.includes('account_blocked')) return 'Konto jest zablokowane. Skontaktuj się z bankiem.';
  if (message.includes('not_authorized')) return 'Sesja wygasła lub została zakończona. Zaloguj się ponownie.';
  if (/could not find the function|schema cache/i.test(message)) {
    return 'Przelewy są chwilowo niedostępne. Spróbuj ponownie później.';
  }
  if (/network|fetch/i.test(message)) return 'Brak połączenia z serwerem.';
  return 'Nie udało się wykonać przelewu.';
};

export const newTransferRequestId = (): string => Crypto.randomUUID();

export const executeTransfer = async (params: {
  accountNumber: string;
  recipientName: string;
  amount: number;
  title: string;
  pin: string;
  requestId: string;
}): Promise<TransferResult> => {
  const { data, error } = await supabase.rpc('execute_transfer', {
    p_recipient_account: params.accountNumber,
    p_recipient_name: params.recipientName,
    p_amount: params.amount,
    p_title: params.title,
    p_pin: params.pin,
    p_request_id: params.requestId,
  });
  if (error) {
    throw new Error(mapTransferError(error.message));
  }
  if (data?.status === 'pin_invalid') {
    return { status: 'pin_invalid', attemptsLeft: Number(data.attempts_left ?? 0), reset: !!data.reset };
  }
  return {
    status: 'ok',
    transactionId: data?.transaction_id,
    balance: Number(data?.balance),
    internal: !!data?.internal,
    duplicate: !!data?.duplicate,
  };
};
