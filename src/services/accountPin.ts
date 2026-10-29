import { supabase } from './supabase';

export interface AccountPinStatus {
  hasPin: boolean;
  version: number | null;
}

export type AccountPinResult =
  | { valid: true; version: number }
  | { valid: false; attemptsLeft: number; reset: boolean; message: string };

const mapPinError = (message?: string): string => {
  if (!message) return 'Operacja na PIN-ie nie powiodła się.';
  if (message.includes('recent_login_required')) return 'Ze względów bezpieczeństwa zaloguj się ponownie hasłem.';
  if (message.includes('invalid_pin_format')) return 'PIN musi składać się z 6 cyfr.';
  if (message.includes('not_authorized')) return 'Brak uprawnień. Zaloguj się ponownie.';
  return message;
};

const toResult = (data: any): AccountPinResult => {
  if (data?.valid) {
    return { valid: true, version: data.version };
  }
  const attemptsLeft = data?.attempts_left ?? 0;
  const reset = !!data?.reset;
  return {
    valid: false,
    attemptsLeft,
    reset,
    message: reset
      ? 'Przekroczono limit prób. PIN został zablokowany, ustaw nowy po zalogowaniu hasłem.'
      : `Niepoprawny PIN. Pozostałe próby: ${attemptsLeft}.`,
  };
};

export const getAccountPinStatus = async (): Promise<AccountPinStatus> => {
  const { data, error } = await supabase.rpc('pin_status');
  if (error) {
    throw new Error(mapPinError(error.message));
  }
  return { hasPin: !!data?.has_pin, version: data?.version ?? null };
};

export const verifyAccountPin = async (pin: string): Promise<AccountPinResult> => {
  const { data, error } = await supabase.rpc('verify_pin', { pin });
  if (error) {
    throw new Error(mapPinError(error.message));
  }
  return toResult(data);
};

export const setAccountPin = async (newPin: string, currentPin?: string): Promise<AccountPinResult> => {
  const { data, error } = await supabase.rpc('set_pin', {
    new_pin: newPin,
    current_pin: currentPin ?? null,
  });
  if (error) {
    throw new Error(mapPinError(error.message));
  }
  return toResult(data);
};
