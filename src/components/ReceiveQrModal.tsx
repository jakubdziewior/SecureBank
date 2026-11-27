import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Share,
} from 'react-native';
import { markUserActivity } from '../services/activity';
import {
  buildQrMatrix,
  buildTransferQrPayload,
  formatNrb,
  normalizeAccountNumber,
} from '../services/transferQr';
import { BankAccount, UserProfile } from '../types';
import { useTheme } from '../theme/ThemeContext';

interface ReceiveQrModalProps {
  visible: boolean;
  account: BankAccount | null;
  profile: UserProfile | null;
  onClose: () => void;
}

const DEFAULT_TITLE = 'Zwrot środków';

export const ReceiveQrModal: React.FC<ReceiveQrModalProps> = ({
  visible,
  account,
  profile,
  onClose,
}) => {
  const { theme } = useTheme();

  const [recipientName, setRecipientName] = useState('');
  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState(DEFAULT_TITLE);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(600)).current;

  useEffect(() => {
    if (!visible) return;
    const defaultName =
      [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() ||
      'Klient SecureBank';
    setRecipientName(defaultName);
    setAmount('');
    setTitle(DEFAULT_TITLE);

    fadeAnim.setValue(0);
    slideAnim.setValue(600);
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        damping: 24,
        stiffness: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, profile]);

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 600,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onClose();
    });
  };

  const accountNumber = account?.account_number ?? '';

  const qrResult = useMemo(
    () =>
      buildTransferQrPayload({
        recipientName,
        accountNumber,
        amount,
        title,
      }),
    [recipientName, accountNumber, amount, title]
  );

  const matrix = useMemo(() => {
    if (!qrResult.ok) return null;
    try {
      return buildQrMatrix(qrResult.payload);
    } catch {
      return null;
    }
  }, [qrResult]);

  const cellSize = matrix ? Math.max(3, Math.floor(204 / matrix.length)) : 0;
  const qrSide = matrix ? cellSize * matrix.length : 0;
  const formattedNrb = formatNrb(normalizeAccountNumber(accountNumber));

  const handleShare = async () => {
    if (!qrResult.ok) return;
    const amountLine = amount.trim() ? `Kwota: ${amount.trim()} PLN\n` : '';
    const titleLine = title.trim() ? `Tytuł: ${title.trim()}\n` : '';
    try {
      await Share.share({
        message:
          `Dane do przelewu w SecureBank:\n` +
          `Odbiorca: ${recipientName.trim()}\n` +
          `Rachunek: PL ${formattedNrb}\n` +
          amountLine +
          titleLine +
          `Kod QR (ZBP): ${qrResult.payload}`,
      });
    } catch {}
  };

  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={handleClose}>
      <Animated.View
        style={[styles.backdrop, { opacity: fadeAnim }]}
        onTouchStart={markUserActivity}
      >
        <TouchableOpacity style={styles.backdropTouch} activeOpacity={1} onPress={handleClose} />
        <KeyboardAvoidingView
          style={styles.sheetContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Animated.View
            style={[
              styles.sheet,
              {
                backgroundColor: theme.card,
                borderColor: theme.cardBorder,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <View style={styles.handleBar} />
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              <Text style={[styles.title, { color: theme.textPrimary }]}>Odbierz przelew (QR)</Text>
              <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                Druga osoba może zeskanować ten kod w opcji „Zleć przelew → Skanuj kod QR”.
              </Text>

              <View
                style={[
                  styles.qrCard,
                  { backgroundColor: theme.cardSecondary, borderColor: theme.cardBorder },
                ]}
              >
                {matrix ? (
                  <View style={styles.qrFrame}>
                    <View style={{ width: qrSide, height: qrSide }}>
                      {matrix.map((row, rowIdx) => (
                        <View key={rowIdx} style={styles.qrRow}>
                          {row.map((dark, colIdx) => (
                            <View
                              key={colIdx}
                              style={{
                                width: cellSize,
                                height: cellSize,
                                backgroundColor: dark ? '#0F172A' : '#FFFFFF',
                              }}
                            />
                          ))}
                        </View>
                      ))}
                    </View>
                  </View>
                ) : (
                  <View style={styles.qrErrorBox}>
                    <Text style={[styles.qrErrorText, { color: theme.expense }]}>
                      {qrResult.ok ? 'Nie udało się wygenerować kodu QR.' : qrResult.error}
                    </Text>
                  </View>
                )}

                <Text style={[styles.accountPreviewLabel, { color: theme.textMuted }]}>
                  Twój numer rachunku
                </Text>
                <Text style={[styles.accountPreviewValue, { color: theme.textPrimary }]}>
                  PL {formattedNrb}
                </Text>
              </View>

              <View style={styles.inputContainer}>
                <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Nazwa odbiorcy</Text>
                <TextInput
                  style={[
                    styles.inputField,
                    {
                      backgroundColor: theme.inputBg,
                      borderColor: theme.inputBorder,
                      color: theme.textPrimary,
                      letterSpacing: 0,
                    },
                  ]}
                  value={recipientName}
                  onChangeText={setRecipientName}
                  placeholder="Imię i nazwisko"
                  placeholderTextColor={theme.textMuted}
                  autoCorrect={false}
                  maxLength={200}
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={[styles.inputLabel, { color: theme.textMuted }]}>
                  Kwota w PLN (opcjonalnie)
                </Text>
                <TextInput
                  style={[
                    styles.inputField,
                    {
                      backgroundColor: theme.inputBg,
                      borderColor: theme.inputBorder,
                      color: theme.textPrimary,
                      letterSpacing: 0,
                    },
                  ]}
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="np. 25,00 (puste = wpisze nadawca)"
                  placeholderTextColor={theme.textMuted}
                  keyboardType="decimal-pad"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Tytuł przelewu</Text>
                <TextInput
                  style={[
                    styles.inputField,
                    {
                      backgroundColor: theme.inputBg,
                      borderColor: theme.inputBorder,
                      color: theme.textPrimary,
                      letterSpacing: 0,
                    },
                  ]}
                  value={title}
                  onChangeText={setTitle}
                  placeholder="np. Zwrot środków"
                  placeholderTextColor={theme.textMuted}
                  autoCorrect={false}
                  maxLength={255}
                />
              </View>

              {qrResult.ok && (
                <TouchableOpacity
                  style={[
                    styles.shareButton,
                    { backgroundColor: theme.primary, opacity: matrix ? 1 : 0.6 },
                  ]}
                  onPress={handleShare}
                  disabled={!matrix}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.shareButtonText, { color: theme.primaryForeground }]}>
                    Udostępnij dane przelewu
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={styles.cancelButton} onPress={handleClose} activeOpacity={0.7}>
                <Text style={[styles.cancelText, { color: theme.textSecondary }]}>Zamknij</Text>
              </TouchableOpacity>
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  backdropTouch: {
    flex: 1,
  },
  sheetContainer: {
    maxHeight: '92%',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 30,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(128, 128, 128, 0.35)',
    alignSelf: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
    textAlign: 'center',
    includeFontPadding: false,
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    marginBottom: 14,
  },
  qrCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    alignItems: 'center',
    marginBottom: 14,
  },
  qrFrame: {
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
  },
  qrRow: {
    flexDirection: 'row',
  },
  qrErrorBox: {
    minHeight: 120,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  qrErrorText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  accountPreviewLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    includeFontPadding: false,
  },
  accountPreviewValue: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
    textAlign: 'center',
    includeFontPadding: false,
  },
  inputContainer: {
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    includeFontPadding: false,
    marginBottom: 6,
  },
  inputField: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 14,
    letterSpacing: 0,
    includeFontPadding: false,
  },
  shareButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  shareButtonText: {
    fontSize: 15,
    fontWeight: '700',
    includeFontPadding: false,
  },
  cancelButton: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 8,
  },
  cancelText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
