import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Modal, Animated } from 'react-native';
import { PinPad } from './PinPad';
import { PIN_LENGTH } from '../services/pin';
import { markUserActivity } from '../services/activity';
import { useTheme } from '../theme/ThemeContext';

export type PinConfirmOutcome =
  | { status: 'ok' }
  | { status: 'retry'; message: string }
  | { status: 'locked' }
  | { status: 'error'; message: string };

interface PinConfirmModalProps {
  visible: boolean;
  title: string;
  description?: string;
  onConfirm: (pin: string) => Promise<PinConfirmOutcome>;
  onClose: () => void;
  onDone: () => void;
  onLocked: () => void;
  onError: (message: string) => void;
}

export const PinConfirmModal: React.FC<PinConfirmModalProps> = ({
  visible,
  title,
  description,
  onConfirm,
  onClose,
  onDone,
  onLocked,
  onError,
}) => {
  const { theme } = useTheme();
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(600)).current;

  useEffect(() => {
    if (!visible) return;
    setPin('');
    setError(null);
    setBusy(false);
    fadeAnim.setValue(0);
    slideAnim.setValue(600);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, damping: 24, stiffness: 220, useNativeDriver: true }),
    ]).start();
  }, [visible]);

  const animateClose = (callback: () => void) => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 600, duration: 200, useNativeDriver: true }),
    ]).start(() => callback());
  };

  useEffect(() => {
    if (pin.length === PIN_LENGTH && !busy) {
      submit(pin);
    }
  }, [pin]);

  const submit = async (value: string) => {
    setBusy(true);
    setError(null);
    try {
      const outcome = await onConfirm(value);
      if (outcome.status === 'ok') {
        animateClose(onDone);
        return;
      }
      if (outcome.status === 'locked') {
        animateClose(onLocked);
        return;
      }
      if (outcome.status === 'error') {
        animateClose(() => onError(outcome.message));
        return;
      }
      setError(outcome.message);
    } catch (e: any) {
      const message = e?.message || 'Operacja nie powiodła się.';
      animateClose(() => onError(message));
    } finally {
      setBusy(false);
      setPin('');
    }
  };

  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={() => { if (!busy) animateClose(onClose); }}>
      <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]} onTouchStart={markUserActivity}>
        <TouchableOpacity style={styles.backdropTouch} activeOpacity={1} onPress={() => !busy && animateClose(onClose)} />
        <Animated.View
          style={[
            styles.sheet,
            { backgroundColor: theme.card, borderColor: theme.cardBorder, transform: [{ translateY: slideAnim }] },
          ]}
        >
          <Text style={[styles.title, { color: theme.textPrimary }]}>{title}</Text>
          {description ? (
            <Text style={[styles.description, { color: theme.textSecondary }]}>{description}</Text>
          ) : null}
          <View style={styles.statusRow}>
            {busy ? (
              <ActivityIndicator color={theme.primary} />
            ) : error ? (
              <Text style={[styles.error, { color: theme.expense }]}>{error}</Text>
            ) : null}
          </View>

          <PinPad length={PIN_LENGTH} value={pin} onChange={setPin} disabled={busy} error={!!error && pin.length === 0} />

          <TouchableOpacity style={styles.cancelButton} onPress={() => animateClose(onClose)} disabled={busy} activeOpacity={0.7}>
            <Text style={[styles.cancelText, { color: theme.textSecondary }]}>Anuluj</Text>
          </TouchableOpacity>
        </Animated.View>
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
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 28,
    paddingTop: 22,
    paddingBottom: 36,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 8,
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
