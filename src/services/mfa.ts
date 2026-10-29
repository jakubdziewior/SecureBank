import { supabase } from './supabase';

export interface TotpEnrollment {
  factorId: string;
  secret: string;
  uri: string;
}

const TOTP_CODE_REGEX = /^\d{6}$/;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const base32Decode = (input: string): number[] => {
  const clean = input.replace(/[\s=]/g, '').toUpperCase();
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of clean) {
    const value = BASE32_ALPHABET.indexOf(char);
    if (value < 0) continue;
    buffer = (buffer << 5) | value;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return bytes;
};

const varint = (value: number): number[] => {
  const out: number[] = [];
  while (value > 0x7f) {
    out.push((value & 0x7f) | 0x80);
    value >>>= 7;
  }
  out.push(value);
  return out;
};

const lengthDelimited = (field: number, bytes: number[]): number[] => [
  (field << 3) | 2,
  ...varint(bytes.length),
  ...bytes,
];

const varintField = (field: number, value: number): number[] => [(field << 3) | 0, ...varint(value)];

const textBytes = (text: string): number[] => Array.from(new TextEncoder().encode(text));

export const buildGoogleAuthenticatorUri = (enrollment: TotpEnrollment, accountName: string): string => {
  const otpParameters = [
    ...lengthDelimited(1, base32Decode(enrollment.secret)),
    ...lengthDelimited(2, textBytes(accountName)),
    ...lengthDelimited(3, textBytes('SecureBank')),
    ...varintField(4, 1),
    ...varintField(5, 1),
    ...varintField(6, 2),
  ];
  const payload = [
    ...lengthDelimited(1, otpParameters),
    ...varintField(2, 1),
    ...varintField(3, 1),
    ...varintField(4, 0),
    ...varintField(5, Math.floor(Math.random() * 0x7fffffff)),
  ];
  const data = btoa(String.fromCharCode(...payload));
  return `otpauth-migration://offline?data=${encodeURIComponent(data)}`;
};

export const isValidTotpCode = (code: string): boolean => TOTP_CODE_REGEX.test(code);

const mapMfaError = (message?: string): string => {
  if (!message) return 'Weryfikacja nie powiodła się.';
  if (/invalid totp|invalid code|expired/i.test(message)) return 'Niepoprawny lub wygasły kod.';
  if (/mfa.*disabled|not enabled/i.test(message)) return 'Weryfikacja dwuetapowa jest wyłączona w projekcie Supabase.';
  return message;
};

export const getVerifiedTotpFactorId = async (): Promise<string | null> => {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) return null;
  return data.totp[0]?.id ?? null;
};

export const isMfaVerificationRequired = async (): Promise<boolean> => {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return false;
  return data.nextLevel === 'aal2' && data.currentLevel !== 'aal2';
};

export const startTotpEnrollment = async (): Promise<TotpEnrollment> => {
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const factor of factors?.all ?? []) {
    if (factor.factor_type === 'totp' && factor.status === 'unverified') {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'Google Authenticator',
    issuer: 'SecureBank',
  });
  if (error || !data) {
    throw new Error(mapMfaError(error?.message));
  }
  return { factorId: data.id, secret: data.totp.secret, uri: data.totp.uri };
};

export const verifyTotpCode = async (factorId: string, code: string): Promise<void> => {
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) {
    throw new Error(mapMfaError(error.message));
  }
};

export const verifyLoginTotpCode = async (code: string): Promise<void> => {
  const factorId = await getVerifiedTotpFactorId();
  if (!factorId) {
    throw new Error('Brak skonfigurowanego Google Authenticator dla tego konta.');
  }
  await verifyTotpCode(factorId, code);
};

export const disableTotp = async (factorId: string): Promise<void> => {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) {
    throw new Error(mapMfaError(error.message));
  }
};
