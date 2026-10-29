import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator } from 'react-native';
import { PinPad } from '../components/PinPad';
import { PIN_LENGTH, PinUnlockResult } from '../services/pin';
import { useTheme } from '../theme/ThemeContext';

type PinScreenProps =
  | {
      mode: 'setup';
      email?: string;
      onCreate: (pin: string) => Promise<void>;
      onCancel: () => void;
    }
  | {
      mode: 'unlock' | 'confirm';
      email?: string;
      subtitle?: string;
      onUnlock: (pin: string) => Promise<PinUnlockResult>;
      onCancel: () => void;
      onForgot: () => void;
    };

export const PinScreen: React.FC<PinScreenProps> = (props) => {
  const { theme } = useTheme();

  const [pin, setPin] = useState('');
  const [firstPin, setFirstPin] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (pin.length === PIN_LENGTH) {
      handleComplete(pin);
    }
  }, [pin]);

  const handleComplete = async (value: string) => {
    setBusy(true);
    setError(null);
    try {
      if (props.mode !== 'setup') {
        const result = await props.onUnlock(value);
        if (!result.success) {
          setError(result.message);
          setPin('');
        }
        return;
      }

      if (firstPin === null) {
        setFirstPin(value);
        setPin('');
        return;
      }
      if (firstPin !== value) {
        setError('PIN-y nie są identyczne. Wprowadź nowy PIN ponownie.');
        setFirstPin(null);
        setPin('');
        return;
      }
      await props.onCreate(value);
    } catch (e: any) {
      setError(e?.message || 'Wystąpił błąd.');
      setFirstPin(null);
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  const title =
    props.mode !== 'setup' ? 'Wprowadź PIN' : firstPin === null ? 'Ustaw PIN aplikacji' : 'Powtórz PIN';

  const subtitle =
    props.mode !== 'setup' && props.subtitle
      ? props.subtitle
      : props.mode === 'confirm'
      ? 'Wpisz swój PIN, aby dokończyć logowanie na tym urządzeniu.'
      : props.mode === 'unlock'
      ? props.email
        ? `Konto: ${props.email}`
        : 'Odblokuj aplikację SecureBank.'
      : `PIN (${PIN_LENGTH} cyfr) szyfruje sesję na tym urządzeniu i służy do szybkiego logowania.`;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>{title}</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{subtitle}</Text>
        <View style={styles.statusRow}>
          {busy ? (
            <ActivityIndicator color={theme.primary} />
          ) : error ? (
            <Text style={[styles.error, { color: theme.expense }]}>{error}</Text>
          ) : null}
        </View>
      </View>

      <PinPad length={PIN_LENGTH} value={pin} onChange={setPin} disabled={busy} error={!!error && pin.length === 0} />

      <View style={styles.actionsRow}>
        {props.mode !== 'setup' && (
          <TouchableOpacity style={styles.actionButton} onPress={props.onForgot} disabled={busy} activeOpacity={0.7}>
            <Text style={[styles.actionText, { color: theme.primary }]}>Nie pamiętam PIN-u</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.actionButton} onPress={props.onCancel} disabled={busy} activeOpacity={0.7}>
          <Text style={[styles.actionText, { color: theme.expense }]}>
            {props.mode === 'setup' ? 'Anuluj i wyloguj' : 'Wyloguj całkowicie'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  statusRow: {
    minHeight: 40,
    justifyContent: 'center',
    marginTop: 8,
  },
  error: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 24,
    marginTop: 28,
  },
  actionButton: {
    paddingVertical: 10,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
