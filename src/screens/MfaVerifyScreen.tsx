import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { isValidTotpCode, verifyLoginTotpCode } from '../services/mfa';
import { useTheme } from '../theme/ThemeContext';

interface MfaVerifyScreenProps {
  email?: string;
  onVerified: () => void;
  onCancel: () => void;
}

export const MfaVerifyScreen: React.FC<MfaVerifyScreenProps> = ({ email, onVerified, onCancel }) => {
  const { theme } = useTheme();

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleVerify = async () => {
    if (!isValidTotpCode(code)) {
      setError('Wprowadź 6-cyfrowy kod z Google Authenticator.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await verifyLoginTotpCode(code);
      onVerified();
    } catch (e: any) {
      setError(e?.message || 'Weryfikacja nie powiodła się.');
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Weryfikacja dwuetapowa</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          {email ? `${email}\n` : ''}Wpisz 6-cyfrowy kod z aplikacji Google Authenticator.
        </Text>

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
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="000000"
          placeholderTextColor={theme.textMuted}
          autoFocus
        />

        {error && <Text style={[styles.error, { color: theme.expense }]}>{error}</Text>}

        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: theme.primary }]}
          onPress={handleVerify}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color={theme.primaryForeground} />
          ) : (
            <Text style={[styles.primaryButtonText, { color: theme.primaryForeground }]}>Zweryfikuj</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelButton} onPress={onCancel} disabled={loading} activeOpacity={0.7}>
          <Text style={[styles.cancelText, { color: theme.textSecondary }]}>Anuluj i wyloguj</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: 8,
    textAlign: 'center',
  },
  error: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 10,
  },
  primaryButton: {
    marginTop: 18,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
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
