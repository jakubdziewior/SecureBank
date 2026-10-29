import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { gcm } from '@noble/ciphers/aes.js';
import { bytesToHex, hexToBytes } from '@noble/ciphers/utils.js';

export const PIN_LENGTH = 6;
export const MAX_PIN_ATTEMPTS = 5;

const VAULT_KEY = 'securebank.pin_vault';
const ATTEMPTS_KEY = 'securebank.pin_attempts';
const KDF_ITERATIONS = 20000;
const ENCRYPTED_PREFIX = 'enc1:';

const storeOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

interface PinVault {
  v: 1;
  userId: string;
  email: string;
  pinVersion: number;
  salt: string;
  iterations: number;
  nonce: string;
  wrappedKey: string;
}

export interface PinVaultInfo {
  userId: string;
  email: string;
  pinVersion: number;
}

export type PinUnlockResult =
  | { success: true }
  | { success: false; wiped: boolean; attemptsLeft: number; message: string };

let sessionKey: Uint8Array | null = null;

const encodeUtf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

const decodeUtf8 = (bytes: Uint8Array): string => {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i++];
    let cp: number;
    if (b < 0x80) {
      cp = b;
    } else if (b < 0xe0) {
      cp = ((b & 0x1f) << 6) | (bytes[i++] & 0x3f);
    } else if (b < 0xf0) {
      cp = ((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
    } else {
      cp =
        ((b & 0x07) << 18) |
        ((bytes[i++] & 0x3f) << 12) |
        ((bytes[i++] & 0x3f) << 6) |
        (bytes[i++] & 0x3f);
    }
    out += String.fromCodePoint(cp);
  }
  return out;
};

const deriveKey = (pin: string, salt: Uint8Array, iterations: number) =>
  pbkdf2Async(sha256, encodeUtf8(pin), salt, { c: iterations, dkLen: 32 });

const readVault = async (): Promise<PinVault | null> => {
  try {
    const raw = await SecureStore.getItemAsync(VAULT_KEY, storeOptions);
    return raw ? (JSON.parse(raw) as PinVault) : null;
  } catch {
    return null;
  }
};

const readAttempts = async (): Promise<number> => {
  const raw = await SecureStore.getItemAsync(ATTEMPTS_KEY, storeOptions);
  return raw ? parseInt(raw, 10) || 0 : 0;
};

export const isValidPinFormat = (pin: string): boolean => new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);

export const getPinVaultInfo = async (): Promise<PinVaultInfo | null> => {
  const vault = await readVault();
  return vault ? { userId: vault.userId, email: vault.email, pinVersion: vault.pinVersion ?? 0 } : null;
};

export const getRemainingPinAttempts = async (): Promise<number> =>
  Math.max(0, MAX_PIN_ATTEMPTS - (await readAttempts()));

export const isSessionUnlocked = (): boolean => sessionKey !== null;

export const lockSession = () => {
  sessionKey?.fill(0);
  sessionKey = null;
};

const writeVault = async (
  pin: string,
  dataKey: Uint8Array,
  owner: { userId: string; email: string; pinVersion: number }
): Promise<void> => {
  if (!isValidPinFormat(pin)) {
    throw new Error(`PIN musi składać się z ${PIN_LENGTH} cyfr.`);
  }

  const salt = Crypto.getRandomBytes(16);
  const nonce = Crypto.getRandomBytes(12);
  const pinKey = await deriveKey(pin, salt, KDF_ITERATIONS);
  const wrappedKey = gcm(pinKey, nonce).encrypt(dataKey);
  pinKey.fill(0);

  const vault: PinVault = {
    v: 1,
    ...owner,
    salt: bytesToHex(salt),
    iterations: KDF_ITERATIONS,
    nonce: bytesToHex(nonce),
    wrappedKey: bytesToHex(wrappedKey),
  };

  await SecureStore.setItemAsync(VAULT_KEY, JSON.stringify(vault), storeOptions);
  await SecureStore.setItemAsync(ATTEMPTS_KEY, '0', storeOptions);
};

export const createPin = async (pin: string, userId: string, email: string, pinVersion: number): Promise<void> => {
  const dataKey = Crypto.getRandomBytes(32);
  await writeVault(pin, dataKey, { userId, email, pinVersion });
  lockSession();
  sessionKey = dataKey;
};

export const rewrapPin = async (newPin: string, pinVersion: number): Promise<void> => {
  const vault = await readVault();
  if (!vault || !sessionKey) {
    throw new Error('Aplikacja jest zablokowana. Odblokuj ją PIN-em.');
  }
  await writeVault(newPin, sessionKey, { userId: vault.userId, email: vault.email, pinVersion });
};

export const unlockWithPin = async (pin: string): Promise<PinUnlockResult> => {
  const vault = await readVault();
  if (!vault) {
    return { success: false, wiped: true, attemptsLeft: 0, message: 'Brak zapisanego PIN-u. Zaloguj się hasłem.' };
  }

  const pinKey = await deriveKey(pin, hexToBytes(vault.salt), vault.iterations);
  try {
    const dataKey = gcm(pinKey, hexToBytes(vault.nonce)).decrypt(hexToBytes(vault.wrappedKey));
    lockSession();
    sessionKey = dataKey;
    await SecureStore.setItemAsync(ATTEMPTS_KEY, '0', storeOptions);
    return { success: true };
  } catch {
    const attempts = (await readAttempts()) + 1;
    if (attempts >= MAX_PIN_ATTEMPTS) {
      await deletePinVault();
      return {
        success: false,
        wiped: true,
        attemptsLeft: 0,
        message: 'Przekroczono limit prób. Dane sesji zostały usunięte, zaloguj się hasłem.',
      };
    }
    await SecureStore.setItemAsync(ATTEMPTS_KEY, String(attempts), storeOptions);
    const attemptsLeft = MAX_PIN_ATTEMPTS - attempts;
    return { success: false, wiped: false, attemptsLeft, message: `Niepoprawny PIN. Pozostałe próby: ${attemptsLeft}.` };
  } finally {
    pinKey.fill(0);
  }
};

export const deletePinVault = async (): Promise<void> => {
  lockSession();
  try {
    await SecureStore.deleteItemAsync(VAULT_KEY, storeOptions);
  } catch {}
  try {
    await SecureStore.deleteItemAsync(ATTEMPTS_KEY, storeOptions);
  } catch {}
};

export const hasPinVault = async (): Promise<boolean> => (await readVault()) !== null;

export const isEncryptedValue = (value: string): boolean => value.startsWith(ENCRYPTED_PREFIX);

export const encryptWithSessionKey = (plaintext: string): string | null => {
  if (!sessionKey) return null;
  const nonce = Crypto.getRandomBytes(12);
  const ciphertext = gcm(sessionKey, nonce).encrypt(encodeUtf8(plaintext));
  return `${ENCRYPTED_PREFIX}${bytesToHex(nonce)}${bytesToHex(ciphertext)}`;
};

export const decryptWithSessionKey = (value: string): string | null => {
  if (!sessionKey) return null;
  try {
    const payload = hexToBytes(value.slice(ENCRYPTED_PREFIX.length));
    const plaintext = gcm(sessionKey, payload.subarray(0, 12)).decrypt(payload.subarray(12));
    return decodeUtf8(plaintext);
  } catch {
    return null;
  }
};
