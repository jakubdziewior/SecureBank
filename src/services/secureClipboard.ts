import * as Clipboard from 'expo-clipboard';

export const SENSITIVE_CLIPBOARD_TTL_MS = 60000;

let pendingValue: string | null = null;
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
  if (!value) return;
  try {
    if ((await Clipboard.getStringAsync()) === value) {
      await Clipboard.setStringAsync('');
    }
  } catch {}
};

export const copySensitive = async (value: string, ttlMs = SENSITIVE_CLIPBOARD_TTL_MS): Promise<void> => {
  cancelTimer();
  await Clipboard.setStringAsync(value);
  pendingValue = value;
  clearTimer = setTimeout(clearSensitiveClipboard, ttlMs);
};
