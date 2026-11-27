import qrcode from 'qrcode-generator';

export interface TransferDraft {
  recipientName: string;
  accountNumber: string;
  amount: string;
  title: string;
}

export type BuildTransferQrResult =
  | { ok: true; payload: string }
  | { ok: false; error: string };

const MAX_QR_LENGTH = 512;
const MAX_NAME_LENGTH = 200;
const MAX_TITLE_LENGTH = 255;

if (qrcode.stringToBytesFuncs?.['UTF-8']) {
  qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
}

export const normalizeAccountNumber = (value: string): string => {
  const compact = value.replace(/[\s-]/g, '').toUpperCase();
  return compact.startsWith('PL') ? compact.slice(2) : compact;
};

const mod97 = (digits: string): number => {
  let remainder = 0;
  for (const digit of digits) {
    remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder;
};

export const isValidNrb = (nrb: string): boolean => {
  if (!/^\d{26}$/.test(nrb)) return false;
  return mod97(`${nrb.slice(2)}2521${nrb.slice(0, 2)}`) === 1;
};

export const buildNrb = (bban: string): string => {
  if (!/^\d{24}$/.test(bban)) {
    throw new Error('BBAN musi mieć 24 cyfry.');
  }
  const checkDigits = String(98 - mod97(`${bban}252100`)).padStart(2, '0');
  return `${checkDigits}${bban}`;
};

export const formatNrb = (nrb: string): string =>
  nrb.length === 26 ? `${nrb.slice(0, 2)} ${nrb.slice(2).replace(/(\d{4})(?=\d)/g, '$1 ')}` : nrb;

const sanitizeText = (value: string, maxLength: number): string =>
  value.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, maxLength);

const sanitizeField = (value: string, maxLength: number): string =>
  value.replace(/[\u0000-\u001F\u007F|]/g, '').trim().slice(0, maxLength);

export const buildTransferQrPayload = (draft: TransferDraft): BuildTransferQrResult => {
  const nrb = normalizeAccountNumber(draft.accountNumber);
  if (!isValidNrb(nrb)) {
    return { ok: false, error: 'Numer rachunku odbiorcy jest nieprawidłowy.' };
  }

  const name = sanitizeField(draft.recipientName, MAX_NAME_LENGTH);
  if (!name) {
    return { ok: false, error: 'Podaj nazwę odbiorcy.' };
  }

  let amountGrosze = '';
  const rawAmount = draft.amount.trim().replace(/\s/g, '');
  if (rawAmount) {
    if (!/^\d{1,7}([.,]\d{1,2})?$/.test(rawAmount)) {
      return { ok: false, error: 'Podaj poprawną kwotę (maks. 2 miejsca po przecinku).' };
    }
    const parsedAmount = Number(rawAmount.replace(',', '.'));
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return { ok: false, error: 'Kwota musi być większa od zera.' };
    }
    const grosze = Math.round(parsedAmount * 100);
    if (grosze <= 0 || String(grosze).length > 9) {
      return { ok: false, error: 'Kwota przekracza dopuszczalny zakres kodu QR.' };
    }
    amountGrosze = String(grosze);
  }

  const title = sanitizeField(draft.title, MAX_TITLE_LENGTH);
  const payload = `|PL|${nrb}|${amountGrosze}|${name}|${title}|`;

  if (payload.length > MAX_QR_LENGTH) {
    return { ok: false, error: `Dane przekraczają limit ${MAX_QR_LENGTH} znaków kodu QR.` };
  }

  return { ok: true, payload };
};

export const buildQrMatrix = (payload: string): boolean[][] => {
  const qr = qrcode(0, 'M');
  qr.addData(payload, 'Byte');
  qr.make();
  const size = qr.getModuleCount();
  const matrix: boolean[][] = [];
  for (let row = 0; row < size; row++) {
    const line: boolean[] = [];
    for (let col = 0; col < size; col++) {
      line.push(qr.isDark(row, col));
    }
    matrix.push(line);
  }
  return matrix;
};

export const parseTransferQr = (raw: string): TransferDraft | null => {
  if (!raw || raw.length > MAX_QR_LENGTH) return null;

  const fields = raw.split('|');
  if (fields.length >= 6) {
    const [, country, account, amountGrosze, name, title] = fields;
    if (country && country.toUpperCase() !== 'PL') return null;
    const nrb = normalizeAccountNumber(account);
    if (!isValidNrb(nrb)) return null;
    if (amountGrosze && !/^\d{1,9}$/.test(amountGrosze)) return null;
    const grosze = amountGrosze ? Number(amountGrosze) : 0;
    return {
      recipientName: sanitizeText(name, MAX_NAME_LENGTH),
      accountNumber: formatNrb(nrb),
      amount: grosze > 0 ? (grosze / 100).toFixed(2).replace('.', ',') : '',
      title: sanitizeText(title, MAX_TITLE_LENGTH),
    };
  }

  const nrb = normalizeAccountNumber(raw);
  if (!isValidNrb(nrb)) return null;
  return { recipientName: '', accountNumber: formatNrb(nrb), amount: '', title: '' };
};
