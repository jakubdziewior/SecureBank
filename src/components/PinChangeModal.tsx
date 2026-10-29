import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Modal } from 'react-native';
import { PinPad } from './PinPad';
import { PIN_LENGTH, rewrapPin } from '../services/pin';
import { setAccountPin } from '../services/accountPin';
import { useTheme } from '../theme/ThemeContext';

interface PinChangeModalProps {
  visible: boolean;
  onClose: () => void;
  onChanged: () => void;
  onLocked: () => void;
}

type Step = 'current' | 'new' | 'repeat';

const STEP_TITLES: Record<Step, string> = {
  current: 'Wprowadź obecny PIN',
  new: 'Wprowadź nowy PIN',
  repeat: 'Powtórz nowy PIN',
};

export const PinChangeModal: React.FC<PinChangeModalProps> = ({ visible, onClose, onChanged, onLocked }) => {
  const { theme } = useTheme();

  const [step, setStep] = useState<Step>('current');
  const [pin, setPin] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setStep('current');
    setPin('');
    setCurrentPin('');
    setNewPin('');
    setError(null);
  }, [visible]);

  useEffect(() => {
    if (pin.length === PIN_LENGTH) {
      handleComplete(pin);
    }
  }, [pin]);

  const handleComplete = async (value: string) => {
    setError(null);

    if (step === 'current') {
      setCurrentPin(value);
      setStep('new');
      setPin('');
      return;
    }
    if (step === 'new') {
      if (value === currentPin) {
        setError('Nowy PIN musi różnić się od obecnego.');
        setPin('');
        return;
      }
      setNewPin(value);
      setStep('repeat');
      setPin('');
      return;
    }
    if (value !== newPin) {
      setError('PIN-y nie są identyczne. Wprowadź nowy PIN ponownie.');
      setStep('new');
      setPin('');
      return;
    }

    setBusy(true);
    try {
      const result = await setAccountPin(newPin, currentPin);
      if (result.valid) {
        await rewrapPin(newPin, result.version);
        onChanged();
        return;
      }
      if (result.reset) {
        onLocked();
        return;
      }
      setError(result.message);
      setStep('current');
    } catch (e: any) {
      setError(e?.message || 'Nie udało się zmienić PIN-u.');
      setStep('current');
    } finally {
      setBusy(false);
      setPin('');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>{STEP_TITLES[step]}</Text>
          <View style={styles.statusRow}>
            {busy ? (
              <ActivityIndicator color={theme.primary} />
            ) : error ? (
              <Text style={[styles.error, { color: theme.expense }]}>{error}</Text>
            ) : null}
          </View>

          <PinPad length={PIN_LENGTH} value={pin} onChange={setPin} disabled={busy} error={!!error && pin.length === 0} />

          <TouchableOpacity style={styles.cancelButton} onPress={onClose} disabled={busy} activeOpacity={0.7}>
            <Text style={[styles.cancelText, { color: theme.textSecondary }]}>Anuluj</Text>
          </TouchableOpacity>
        </View>
      </View>
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
    paddingHorizontal: 28,
    paddingTop: 24,
    paddingBottom: 36,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  statusRow: {
    minHeight: 40,
    justifyContent: 'center',
    marginVertical: 8,
  },
  error: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  cancelButton: {
    marginTop: 20,
    alignItems: 'center',
    paddingVertical: 8,
  },
  cancelText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
