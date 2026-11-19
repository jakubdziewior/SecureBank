import * as Clipboard from 'expo-clipboard';

export const SENSITIVE_CLIPBOARD_TTL_MS = 60000;

let pendingValue: string | null = null;
let expiresAt = 0;
let clearTimer: ReturnType<typeof setTimeout> | null = null;

const cancelTimer = () => {
  if (clearTimer) {
    clearTimeout(clearTimer);
    clearTimer = null;
  }
};

export const clearSensitiveClipboard = async (): Promise<void> => {
  cancelTimer();
  const value = pendingValue;
  pendingValue = null;
  expiresAt = 0;
  if (!value) return;
  try {
    if ((await Clipboard.getStringAsync()) === value) {
      await Clipboard.setStringAsync('');
    }
  } catch {}
};

export const clearExpiredSensitiveClipboard = async (): Promise<void> => {
  if (pendingValue && Date.now() >= expiresAt) {
    await clearSensitiveClipboard();
  }
};

export const copySensitive = async (value: string, ttlMs = SENSITIVE_CLIPBOARD_TTL_MS): Promise<void> => {
  cancelTimer();
  const expiry = Date.now() + ttlMs;
  await Clipboard.setStringAsync(value, {
    android: { isSensitive: true },
    ios: { localOnly: true, expiresAt: new Date(expiry) },
  });
  pendingValue = value;
  expiresAt = expiry;
  clearTimer = setTimeout(clearSensitiveClipboard, ttlMs);
};
