import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Linking,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import {
  TotpEnrollment,
  buildGoogleAuthenticatorUri,
  isValidTotpCode,
  startTotpEnrollment,
  verifyTotpCode,
} from '../services/mfa';
import { useTheme } from '../theme/ThemeContext';

interface TotpSetupModalProps {
  accountName: string;
  visible: boolean;
  onClose: () => void;
  onEnabled: () => void;
}

const formatSecret = (secret: string) => secret.replace(/(.{4})/g, '$1 ').trim();

export const TotpSetupModal: React.FC<TotpSetupModalProps> = ({ accountName, visible, onClose, onEnabled }) => {
  const { theme } = useTheme();

  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setEnrollment(null);
    setCode('');
    setError(null);
    setInfo(null);
    setLoading(true);
    startTotpEnrollment()
      .then(setEnrollment)
      .catch((e) => setError(e?.message || 'Nie udało się rozpocząć konfiguracji.'))
      .finally(() => setLoading(false));
  }, [visible]);

  const handleOpenAuthenticator = async () => {
    if (!enrollment) return;
    await Clipboard.setStringAsync(enrollment.secret);
    try {
      await Linking.openURL(buildGoogleAuthenticatorUri(enrollment, accountName));
      setInfo('Klucz skopiowany. Jeśli konto nie dodało się automatycznie, w Google Authenticator wybierz + → Wpisz klucz konfiguracji i wklej klucz.');
    } catch {
      setInfo('Nie znaleziono Google Authenticator. Klucz skopiowano do schowka: dodaj konto ręcznie (+ → Wpisz klucz konfiguracji).');
    }
  };

  const handleCopySecret = async () => {
    if (!enrollment) return;
    await Clipboard.setStringAsync(enrollment.secret);
    setInfo('Klucz skopiowany do schowka.');
  };

  const handleConfirm = async () => {
    if (!enrollment) return;
    if (!isValidTotpCode(code)) {
      setError('Wprowadź 6-cyfrowy kod z Google Authenticator.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await verifyTotpCode(enrollment.factorId, code);
      onEnabled();
    } catch (e: any) {
      setError(e?.message || 'Weryfikacja nie powiodła się.');
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.backdrop}
      >
        <View style={[styles.sheet, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>Google Authenticator</Text>

          {!enrollment ? (
            <View style={styles.loaderBox}>
              {loading ? (
                <ActivityIndicator color={theme.primary} />
              ) : (
                <Text style={[styles.error, { color: theme.expense }]}>{error}</Text>
              )}
            </View>
          ) : (
            <>
              <Text style={[styles.step, { color: theme.textSecondary }]}>
                1. Dodaj konto SecureBank w Google Authenticator.
              </Text>
              <TouchableOpacity
                style={[styles.secondaryButton, { borderColor: theme.primary }]}
                onPress={handleOpenAuthenticator}
                activeOpacity={0.8}
              >
                <Text style={[styles.secondaryButtonText, { color: theme.primary }]}>
                  Otwórz Google Authenticator
                </Text>
              </TouchableOpacity>

              <Text style={[styles.hint, { color: theme.textMuted }]}>Lub wpisz klucz ręcznie:</Text>
              <TouchableOpacity
                style={[styles.secretBox, { backgroundColor: theme.cardSecondary, borderColor: theme.cardBorder }]}
                onPress={handleCopySecret}
                activeOpacity={0.7}
              >
                <Text style={[styles.secret, { color: theme.textPrimary }]}>{formatSecret(enrollment.secret)}</Text>
                <Text style={[styles.copyHint, { color: theme.primary }]}>Dotknij, aby skopiować</Text>
              </TouchableOpacity>

              {info && <Text style={[styles.info, { color: theme.textSecondary }]}>{info}</Text>}

              <Text style={[styles.step, { color: theme.textSecondary }]}>2. Wpisz kod wyświetlony w aplikacji.</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.inputBg,
                    borderColor: error ? theme.expense : theme.inputBorder,
                    color: theme.textPrimary,
                  },
                ]}
                value={code}
                onChangeText={(text) => {
                  setCode(text.replace(/\D/g, '').slice(0, 6));
                  if (error) setError(null);
                }}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                maxLength={6}
                placeholder="000000"
                placeholderTextColor={theme.textMuted}
              />

              {error && <Text style={[styles.error, { color: theme.expense }]}>{error}</Text>}

              <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: theme.primary }]}
                onPress={handleConfirm}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color={theme.primaryForeground} />
                ) : (
                  <Text style={[styles.primaryButtonText, { color: theme.primaryForeground }]}>
                    Włącz weryfikację dwuetapową
                  </Text>
                )}
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity style={styles.cancelButton} onPress={onClose} disabled={loading} activeOpacity={0.7}>
            <Text style={[styles.cancelText, { color: theme.textSecondary }]}>Anuluj</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    padding: 22,
    paddingBottom: 36,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  loaderBox: {
    minHeight: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  step: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 10,
    marginTop: 6,
  },
  hint: {
    fontSize: 12,
    marginTop: 12,
    marginBottom: 6,
  },
  secretBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  secret: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
    textAlign: 'center',
  },
  copyHint: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 6,
  },
  info: {
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 6,
    textAlign: 'center',
  },
  error: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 10,
  },
  primaryButton: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryButton: {
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: '600',
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
