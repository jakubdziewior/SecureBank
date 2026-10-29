import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Alert, Animated, Platform } from 'react-native';
import { disableTotp, getVerifiedTotpFactorId } from '../services/mfa';
import { TotpSetupModal } from './TotpSetupModal';
import { PinChangeModal } from './PinChangeModal';
import { useTheme } from '../theme/ThemeContext';

interface SecuritySectionProps {
  userEmail: string;
  onPinLocked: () => void;
}

export const SecuritySection: React.FC<SecuritySectionProps> = ({ userEmail, onPinLocked }) => {
  const { theme, isDark } = useTheme();

  const [expanded, setExpanded] = useState(false);
  const [totpFactorId, setTotpFactorId] = useState<string | null>(null);
  const [totpLoading, setTotpLoading] = useState(true);
  const [totpSetupVisible, setTotpSetupVisible] = useState(false);
  const [pinChangeVisible, setPinChangeVisible] = useState(false);

  const expandAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadTotpState();
  }, []);

  const loadTotpState = async () => {
    setTotpLoading(true);
    setTotpFactorId(await getVerifiedTotpFactorId());
    setTotpLoading(false);
  };

  const toggleExpanded = () => {
    Animated.timing(expandAnim, {
      toValue: expanded ? 0 : 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
    setExpanded((prev) => !prev);
  };

  const handleTotpEnabled = () => {
    setTotpSetupVisible(false);
    loadTotpState();
  };

  const handleTotpDisable = async () => {
    if (!totpFactorId) return;
    setTotpLoading(true);
    try {
      await disableTotp(totpFactorId);
    } catch (e: any) {
      Alert.alert('Weryfikacja dwuetapowa', e?.message || 'Nie udało się wyłączyć.');
    }
    await loadTotpState();
  };

  const handlePinChanged = () => {
    setPinChangeVisible(false);
    Alert.alert('PIN', 'PIN został zmieniony.');
  };

  const handlePinLocked = () => {
    setPinChangeVisible(false);
    Alert.alert('PIN', 'Przekroczono limit prób. Zaloguj się ponownie hasłem i ustaw nowy PIN.');
    onPinLocked();
  };

  const chevronRotation = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.card,
          borderColor: theme.cardBorder,
          shadowColor: isDark ? '#000000' : '#64748B',
        },
      ]}
    >
      <TouchableOpacity style={styles.header} onPress={toggleExpanded} activeOpacity={0.7}>
        <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>Bezpieczeństwo</Text>
        <Animated.Text style={[styles.chevron, { color: theme.textMuted, transform: [{ rotate: chevronRotation }] }]}>
          ▾
        </Animated.Text>
      </TouchableOpacity>

      {expanded && (
        <View style={[styles.content, { borderTopColor: theme.cardBorder }]}>
          {Platform.OS !== 'web' && (
            <View style={[styles.row, styles.rowDivider, { borderBottomColor: theme.cardBorder }]}>
              <View style={styles.rowText}>
                <Text style={[styles.rowTitle, { color: theme.textPrimary }]}>PIN aplikacji</Text>
                <Text style={[styles.rowSubtitle, { color: theme.textSecondary }]}>
                  6 cyfr · przypisany do konta
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.rowButton, { borderColor: theme.primary }]}
                onPress={() => setPinChangeVisible(true)}
                activeOpacity={0.7}
              >
                <Text style={[styles.rowButtonText, { color: theme.primary }]}>Zmień</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, { color: theme.textPrimary }]}>Weryfikacja dwuetapowa</Text>
              <Text style={[styles.rowSubtitle, { color: theme.textSecondary }]}>
                {totpLoading
                  ? 'Sprawdzanie...'
                  : totpFactorId
                  ? 'Włączona · Google Authenticator'
                  : 'Wyłączona · kod z Google Authenticator przy logowaniu na nowym urządzeniu'}
              </Text>
            </View>
            {totpLoading ? (
              <ActivityIndicator color={theme.primary} />
            ) : (
              <TouchableOpacity
                style={[styles.rowButton, { borderColor: totpFactorId ? theme.expense : theme.primary }]}
                onPress={totpFactorId ? handleTotpDisable : () => setTotpSetupVisible(true)}
                activeOpacity={0.7}
              >
                <Text style={[styles.rowButtonText, { color: totpFactorId ? theme.expense : theme.primary }]}>
                  {totpFactorId ? 'Wyłącz' : 'Włącz'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      <TotpSetupModal
        accountName={userEmail}
        visible={totpSetupVisible}
        onClose={() => setTotpSetupVisible(false)}
        onEnabled={handleTotpEnabled}
      />
      <PinChangeModal
        visible={pinChangeVisible}
        onClose={() => setPinChangeVisible(false)}
        onChanged={handlePinChanged}
        onLocked={handlePinLocked}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 20,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  chevron: {
    fontSize: 18,
    fontWeight: '700',
  },
  content: {
    borderTopWidth: 1,
    paddingHorizontal: 18,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  rowDivider: {
    borderBottomWidth: 1,
  },
  rowText: {
    flex: 1,
    marginRight: 12,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  rowSubtitle: {
    fontSize: 12,
    marginTop: 3,
  },
  rowButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  rowButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
