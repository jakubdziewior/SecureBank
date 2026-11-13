import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Linking,
  AppState,
  AppStateStatus,
  Animated,
} from 'react-native';
import { CameraView, BarcodeScanningResult } from 'expo-camera';
import { supabase } from '../services/supabase';
import { CameraAccess, getCameraAccess, logCameraAccess, requestCameraAccess } from '../services/cameraPermission';
import { TransferDraft, isValidNrb, normalizeAccountNumber, parseTransferQr } from '../services/transferQr';
import { BankAccount } from '../types';
import { useTheme } from '../theme/ThemeContext';

interface TransferModalProps {
  visible: boolean;
  account: BankAccount | null;
  onClose: () => void;
  onSubmitted: () => void;
}

type BannerKind = 'denied' | 'permanentlyDenied' | 'unavailable' | 'invalidQr' | 'scanned';

const BANNER_MESSAGES: Record<BannerKind, string> = {
  denied: 'Nie udzielono dostępu do aparatu. Możesz wpisać dane przelewu ręcznie lub spróbować ponownie.',
  permanentlyDenied:
    'Dostęp do aparatu jest wyłączony w ustawieniach systemu. Włącz go, aby skanować kody QR. Formularz ręczny działa bez zmian.',
  unavailable: 'Aparat jest niedostępny na tym urządzeniu. Wpisz dane przelewu ręcznie.',
  invalidQr: 'Kod QR nie zawiera poprawnych danych przelewu. Wpisz dane ręcznie lub zeskanuj inny kod.',
  scanned: 'Dane uzupełniono z kodu QR. Sprawdź je przed zatwierdzeniem przelewu.',
};

const EMPTY_DRAFT: TransferDraft = { recipientName: '', accountNumber: '', amount: '', title: '' };

const accessToBanner = (access: CameraAccess): BannerKind | null =>
  access === 'denied' || access === 'permanentlyDenied' || access === 'unavailable' ? access : null;

export const TransferModal: React.FC<TransferModalProps> = ({ visible, account, onClose, onSubmitted }) => {
  const { theme } = useTheme();

  const [draft, setDraft] = useState<TransferDraft>(EMPTY_DRAFT);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [checkingCamera, setCheckingCamera] = useState(false);
  const [banner, setBanner] = useState<BannerKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const scanHandledRef = useRef(false);
  const settingsOpenedRef = useRef(false);
  const scannerOpenRef = useRef(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(600)).current;

  useEffect(() => {
    scannerOpenRef.current = scannerOpen;
  }, [scannerOpen]);

  useEffect(() => {
    if (!visible) return;
    setDraft(EMPTY_DRAFT);
    setScannerOpen(false);
    setBanner(null);
    setError(null);
    settingsOpenedRef.current = false;

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
  }, [visible]);

  useEffect(() => {
    if (!visible) return;

    const handleAppStateChange = async (nextState: AppStateStatus) => {
      if (nextState !== 'active') return;
      if (!scannerOpenRef.current && !settingsOpenedRef.current) return;

      const access = await getCameraAccess();
      logCameraAccess('appState', access);

      if (access === 'granted') {
        if (settingsOpenedRef.current) {
          settingsOpenedRef.current = false;
          setBanner(null);
          openScanner();
        }
        return;
      }
      settingsOpenedRef.current = false;
      setScannerOpen(false);
      setBanner(accessToBanner(access) ?? 'denied');
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [visible]);

  const handleClose = () => {
    if (scannerOpen) {
      setScannerOpen(false);
      return;
    }
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

  const openScanner = () => {
    scanHandledRef.current = false;
    setScannerOpen(true);
  };

  const handleScanPress = async () => {
    setError(null);
    setCheckingCamera(true);
    const access = await requestCameraAccess();
    setCheckingCamera(false);
    logCameraAccess('scanButton', access);

    if (access === 'granted') {
      setBanner(null);
      openScanner();
      return;
    }
    setScannerOpen(false);
    setBanner(accessToBanner(access) ?? 'denied');
  };

  const handleOpenSettings = async () => {
    settingsOpenedRef.current = true;
    try {
      await Linking.openSettings();
    } catch {
      settingsOpenedRef.current = false;
    }
  };

  const handleBarcodeScanned = ({ data }: BarcodeScanningResult) => {
    if (scanHandledRef.current) return;
    scanHandledRef.current = true;
    setScannerOpen(false);

    const parsed = parseTransferQr(data);
    if (!parsed) {
      setBanner('invalidQr');
      return;
    }
    setDraft((prev) => ({
      recipientName: parsed.recipientName || prev.recipientName,
      accountNumber: parsed.accountNumber,
      amount: parsed.amount || prev.amount,
      title: parsed.title || prev.title,
    }));
    setBanner('scanned');
  };

  const handleCameraMountError = () => {
    logCameraAccess('cameraMountError', 'unavailable');
    setScannerOpen(false);
    setBanner('unavailable');
  };

  const updateField = (field: keyof TransferDraft) => (value: string) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
    if (error) setError(null);
  };

  const handleSubmit = async () => {
    const nrb = normalizeAccountNumber(draft.accountNumber);
    const amountText = draft.amount.replace(/\s/g, '');
    const amount = Number(amountText.replace(',', '.'));

    if (!draft.recipientName.trim()) {
      setError('Podaj nazwę odbiorcy.');
      return;
    }
    if (!isValidNrb(nrb)) {
      setError('Numer rachunku jest nieprawidłowy (26 cyfr, poprawna suma kontrolna).');
      return;
    }
    if (!/^\d{1,12}([.,]\d{1,2})?$/.test(amountText) || amount <= 0) {
      setError('Podaj poprawną kwotę (maksymalnie 2 miejsca po przecinku).');
      return;
    }
    if (!draft.title.trim()) {
      setError('Podaj tytuł przelewu.');
      return;
    }
    if (!account) {
      setError('Brak danych rachunku nadawcy.');
      return;
    }

    setSubmitting(true);
    try {
      const { error: insertError } = await supabase.from('transactions').insert({
        sender_account_id: account.id,
        recipient_account_number: nrb,
        recipient_name: draft.recipientName.trim(),
        amount,
        title: draft.title.trim(),
        status: 'pending',
      });
      if (insertError) throw insertError;
      onSubmitted();
    } catch (e: any) {
      setError(e?.message || 'Nie udało się zlecić przelewu.');
    } finally {
      setSubmitting(false);
    }
  };

  const bannerIsInfo = banner === 'scanned';

  const renderInput = (
    label: string,
    field: keyof TransferDraft,
    options: { placeholder?: string; keyboardType?: 'default' | 'number-pad' | 'decimal-pad'; maxLength?: number } = {}
  ) => (
    <View style={styles.inputContainer}>
      <Text style={[styles.inputLabel, { color: theme.textMuted }]}>{label}</Text>
      <TextInput
        style={[
          styles.inputField,
          { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.textPrimary },
        ]}
        value={draft[field]}
        onChangeText={updateField(field)}
        placeholder={options.placeholder}
        placeholderTextColor={theme.textMuted}
        keyboardType={options.keyboardType ?? 'default'}
        maxLength={options.maxLength}
        autoCorrect={false}
        editable={!submitting}
      />
    </View>
  );

  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={handleClose}>
      <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
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
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} bounces={false}>
              <Text style={[styles.title, { color: theme.textPrimary }]}>Nowy przelew</Text>

              {scannerOpen ? (
                <View style={styles.scannerContainer}>
                  <View style={[styles.cameraFrame, { borderColor: theme.primary }]}>
                    <CameraView
                      style={styles.camera}
                      facing="back"
                      barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                      onBarcodeScanned={handleBarcodeScanned}
                      onMountError={handleCameraMountError}
                    />
                  </View>
                  <Text style={[styles.scannerHint, { color: theme.textSecondary }]}>
                    Skieruj aparat na kod QR z faktury lub wezwania do zapłaty.
                  </Text>
                  <TouchableOpacity
                    style={[styles.secondaryButton, { borderColor: theme.cardBorder }]}
                    onPress={() => setScannerOpen(false)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.secondaryButtonText, { color: theme.textPrimary }]}>Wpisz dane ręcznie</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <TouchableOpacity
                    style={[styles.scanButton, { borderColor: theme.primary, backgroundColor: theme.primarySoft }]}
                    onPress={handleScanPress}
                    disabled={checkingCamera || submitting}
                    activeOpacity={0.7}
                  >
                    {checkingCamera ? (
                      <ActivityIndicator color={theme.primary} />
                    ) : (
                      <Text style={[styles.scanButtonText, { color: theme.primary }]}>Skanuj kod QR</Text>
                    )}
                  </TouchableOpacity>

                  {banner && (
                    <View
                      style={[
                        styles.banner,
                        {
                          backgroundColor: bannerIsInfo ? theme.primarySoft : theme.expenseSoft,
                          borderColor: bannerIsInfo ? theme.primary : theme.expense,
                        },
                      ]}
                    >
                      <Text style={[styles.bannerMessage, { color: theme.textPrimary }]}>{BANNER_MESSAGES[banner]}</Text>
                      {banner === 'denied' && (
                        <TouchableOpacity onPress={handleScanPress} activeOpacity={0.7} style={styles.bannerAction}>
                          <Text style={[styles.bannerActionText, { color: theme.primary }]}>Spróbuj ponownie</Text>
                        </TouchableOpacity>
                      )}
                      {banner === 'permanentlyDenied' && Platform.OS !== 'web' && (
                        <TouchableOpacity onPress={handleOpenSettings} activeOpacity={0.7} style={styles.bannerAction}>
                          <Text style={[styles.bannerActionText, { color: theme.primary }]}>Otwórz ustawienia</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}

                  {renderInput('Nazwa odbiorcy', 'recipientName', { maxLength: 200 })}
                  {renderInput('Numer rachunku', 'accountNumber', {
                    placeholder: '00 0000 0000 0000 0000 0000 0000',
                    keyboardType: 'number-pad',
                    maxLength: 34,
                  })}
                  {renderInput('Kwota (PLN)', 'amount', { placeholder: '0,00', keyboardType: 'decimal-pad', maxLength: 15 })}
                  {renderInput('Tytuł', 'title', { maxLength: 255 })}

                  <View style={styles.statusRow}>
                    {error && <Text style={[styles.error, { color: theme.expense }]}>{error}</Text>}
                  </View>

                  <TouchableOpacity
                    style={[styles.submitButton, { backgroundColor: theme.primary }]}
                    onPress={handleSubmit}
                    disabled={submitting}
                    activeOpacity={0.85}
                  >
                    {submitting ? (
                      <ActivityIndicator color={theme.primaryForeground} />
                    ) : (
                      <Text style={[styles.submitButtonText, { color: theme.primaryForeground }]}>Zleć przelew</Text>
                    )}
                  </TouchableOpacity>
                </>
              )}

              <TouchableOpacity style={styles.cancelButton} onPress={handleClose} disabled={submitting} activeOpacity={0.7}>
                <Text style={[styles.cancelText, { color: theme.textSecondary }]}>Anuluj</Text>
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
    borderTopWidth: 1,
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 28,
    maxHeight: '100%',
  },
  handleBar: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#94A3B8',
    alignSelf: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
  },
  scanButton: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 14,
  },
  scanButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  banner: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  bannerMessage: {
    fontSize: 12,
    lineHeight: 18,
  },
  bannerAction: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  bannerActionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  scannerContainer: {
    alignItems: 'center',
  },
  cameraFrame: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 16,
    borderWidth: 2,
    overflow: 'hidden',
  },
  camera: {
    flex: 1,
  },
  scannerHint: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 14,
  },
  secondaryButton: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
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
  },
  statusRow: {
    minHeight: 24,
    justifyContent: 'center',
    marginBottom: 6,
  },
  error: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  submitButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  cancelButton: {
    marginTop: 16,
    alignItems: 'center',
    paddingVertical: 8,
  },
  cancelText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
