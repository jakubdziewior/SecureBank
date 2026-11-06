export interface TransferDraft {
  recipientName: string;
  accountNumber: string;
  amount: string;
  title: string;
}

const MAX_QR_LENGTH = 512;
const MAX_NAME_LENGTH = 200;
const MAX_TITLE_LENGTH = 255;

export const normalizeAccountNumber = (value: string): string => {
  const compact = value.replace(/[\s-]/g, '').toUpperCase();
  return compact.startsWith('PL') ? compact.slice(2) : compact;
};

export const isValidNrb = (nrb: string): boolean => {
  if (!/^\d{26}$/.test(nrb)) return false;
  const rearranged = `${nrb.slice(2)}2521${nrb.slice(0, 2)}`;
  let remainder = 0;
  for (const digit of rearranged) {
    remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
};

export const formatNrb = (nrb: string): string =>
  nrb.length === 26 ? `${nrb.slice(0, 2)} ${nrb.slice(2).replace(/(\d{4})(?=\d)/g, '$1 ')}` : nrb;

const sanitizeText = (value: string, maxLength: number): string =>
  value.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, maxLength);

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
