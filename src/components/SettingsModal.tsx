import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
  Animated,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { supabase } from '../services/supabase';
import { disableTotp, getVerifiedTotpFactorId } from '../services/mfa';
import { UserProfile, BankAccount } from '../types';
import { useTheme } from '../theme/ThemeContext';
import { PinChangeModal } from './PinChangeModal';
import { TotpSetupModal } from './TotpSetupModal';
import {
  verifySupabaseTlsChannel,
  simulateMitmInterceptionTest,
  getNetworkSecuritySummary,
} from '../services/certificatePinning';

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
  profile: UserProfile | null;
  account: BankAccount | null;
  userEmail: string;
  onPinLocked: () => void;
  balanceVisible: boolean;
  onToggleBalancePrivacy: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  visible,
  onClose,
  profile,
  account,
  userEmail,
  onPinLocked,
  balanceVisible,
  onToggleBalancePrivacy,
}) => {
  const { theme } = useTheme();

  const [totpFactorId, setTotpFactorId] = useState<string | null>(null);
  const [totpLoading, setTotpLoading] = useState(true);
  const [totpSetupVisible, setTotpSetupVisible] = useState(false);
  const [pinChangeVisible, setPinChangeVisible] = useState(false);

  const [passwordChangeOpen, setPasswordChangeOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [pinningTesting, setPinningTesting] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(600)).current;
  const passwordExpandAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      loadTotpState();
      setPasswordChangeOpen(false);
      passwordExpandAnim.setValue(0);
      setPasswordMessage(null);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');

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
    }
  }, [visible]);

  const togglePasswordChange = () => {
    if (passwordChangeOpen) {
      Animated.timing(passwordExpandAnim, {
        toValue: 0,
        duration: 240,
        useNativeDriver: false,
      }).start(() => {
        setPasswordChangeOpen(false);
        setPasswordMessage(null);
      });
    } else {
      setPasswordChangeOpen(true);
      Animated.timing(passwordExpandAnim, {
        toValue: 1,
        duration: 280,
        useNativeDriver: false,
      }).start();
    }
  };

  const loadTotpState = async () => {
    setTotpLoading(true);
    try {
      const factorId = await getVerifiedTotpFactorId();
      setTotpFactorId(factorId);
    } catch {
      setTotpFactorId(null);
    } finally {
      setTotpLoading(false);
    }
  };

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

  const handleTotpEnabled = () => {
    setTotpSetupVisible(false);
    loadTotpState();
  };

  const handleTotpDisable = async () => {
    if (!totpFactorId) return;
    setTotpLoading(true);
    try {
      await disableTotp(totpFactorId);
      Alert.alert('Weryfikacja dwuetapowa', 'Uwierzytelnianie dwuetapowe zostało wyłączone.');
    } catch (e: any) {
      Alert.alert('Błąd', e?.message || 'Nie udało się wyłączyć 2FA.');
    }
    await loadTotpState();
  };

  const handlePinChanged = () => {
    setPinChangeVisible(false);
    Alert.alert('PIN', 'PIN aplikacji został pomyślnie zmieniony.');
  };

  const handlePinLocked = () => {
    setPinChangeVisible(false);
    handleClose();
    onPinLocked();
  };

  const handleCheckPinning = async () => {
    setPinningTesting(true);
    try {
      const rawUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://placeholder-project.supabase.co';
      const anonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key').trim();
      const check = await verifySupabaseTlsChannel(rawUrl, anonKey);

      Alert.alert(
        'Weryfikacja kanału TLS',
        `Status Certificate Pinning: ${check.success ? 'POZYTYWNY' : 'BŁĄD'}\n` +
          `Domena: ${check.domain}\n` +
          `Przypięte klucze SPKI: ${check.pins.length} (Leaf, WE1, GTS Root R4)\n` +
          `Czas handshake: ${check.latencyMs} ms\n` +
          `Reguła NSC Android: cleartextTrafficPermitted=false, CA=system\n\n` +
          `${check.message}`
      );
    } catch (e: any) {
      Alert.alert('Błąd TLS', e?.message || 'Nie udało się zweryfikować połączenia.');
    } finally {
      setPinningTesting(false);
    }
  };

  const handleSimulateMitm = async () => {
    const sim = await simulateMitmInterceptionTest();
    Alert.alert(
      'Test odporności na MitM / Proxy',
      `Wynik symulacji ataku Man-in-the-Middle:\n` +
        `Połączenie zablokowane: ${sim.blocked ? 'TAK' : 'NIE'}\n` +
        `Wyjątek: ${sim.exceptionName}\n\n` +
        `${sim.errorMessage}`
    );
  };

  const handlePasswordChangeSubmit = async () => {
    setPasswordMessage(null);

    if (!currentPassword) {
      setPasswordMessage({ type: 'error', text: 'Podaj obecne hasło.' });
      return;
    }
    if (!newPassword || newPassword.length < 8) {
      setPasswordMessage({ type: 'error', text: 'Nowe hasło musi mieć co najmniej 8 znaków.' });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordMessage({ type: 'error', text: 'Nowe hasła nie są identyczne.' });
      return;
    }
    if (currentPassword === newPassword) {
      setPasswordMessage({ type: 'error', text: 'Nowe hasło musi różnić się od obecnego.' });
      return;
    }

    setPasswordLoading(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password: currentPassword,
      });

      if (signInError) {
        setPasswordMessage({ type: 'error', text: 'Obecne hasło jest niepoprawne.' });
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        throw updateError;
      }

      try {
        await supabase.auth.signOut({ scope: 'others' });
      } catch {}

      setPasswordMessage({
        type: 'success',
        text: 'Hasło zostało pomyślnie zmienione. Pozostałe sesje zostały unieważnione.',
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setTimeout(() => {
        Animated.timing(passwordExpandAnim, {
          toValue: 0,
          duration: 240,
          useNativeDriver: false,
        }).start(() => {
          setPasswordChangeOpen(false);
          setPasswordMessage(null);
        });
      }, 2500);
    } catch (err: any) {
      setPasswordMessage({ type: 'error', text: err?.message || 'Nie udało się zmienić hasła.' });
    } finally {
      setPasswordLoading(false);
    }
  };

  const passwordFormHeight = passwordExpandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 480],
  });

  const passwordFormOpacity = passwordExpandAnim.interpolate({
    inputRange: [0, 0.25, 1],
    outputRange: [0, 0.2, 1],
  });

  const passwordFormTranslateY = passwordExpandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-12, 0],
  });

  const getUserInitials = (): string => {
    if (profile?.first_name && profile?.last_name) {
      return `${profile.first_name[0]}${profile.last_name[0]}`.toUpperCase();
    }
    if (profile?.first_name) {
      return profile.first_name.slice(0, 2).toUpperCase();
    }
    return userEmail.slice(0, 2).toUpperCase();
  };

  const fullName = profile?.last_name
    ? `${profile.first_name} ${profile.last_name}`
    : profile?.first_name || 'Użytkownik';

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
        <TouchableOpacity style={styles.backdropTouch} activeOpacity={1} onPress={handleClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetContainer}>
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

            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: theme.textPrimary }]}>Ustawienia i Profil</Text>
              <TouchableOpacity onPress={handleClose} style={styles.closeButton} activeOpacity={0.7}>
                <Text style={[styles.closeButtonText, { color: theme.textSecondary }]}>Zamknij</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} bounces={false} contentContainerStyle={styles.scrollContent}>
              <View
                style={[
                  styles.profileCard,
                  {
                    backgroundColor: theme.cardSecondary,
                    borderColor: theme.cardBorder,
                  },
                ]}
              >
                <View style={[styles.avatarLarge, { backgroundColor: theme.primarySoft, borderColor: theme.primary }]}>
                  <Text style={[styles.avatarLargeText, { color: theme.primary }]}>{getUserInitials()}</Text>
                </View>
                <View style={styles.profileDetails}>
                  <Text style={[styles.profileName, { color: theme.textPrimary }]}>{fullName}</Text>
                  <Text style={[styles.profileEmail, { color: theme.textSecondary }]}>{userEmail}</Text>
                  <View style={styles.badgeRow}>
                    <View style={[styles.roleBadge, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                      <Text style={[styles.roleBadgeText, { color: theme.textSecondary }]}>
                        {profile?.role === 'admin' ? 'Administrator' : 'Konto osobiste'}
                      </Text>
                    </View>
                    {profile?.client_number && (
                      <View style={[styles.idBadge, { backgroundColor: theme.card, borderColor: theme.primary }]}>
                        <Text style={[styles.idBadgeText, { color: theme.primary }]}>
                          ID: {profile.client_number}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>

              <Text style={[styles.sectionHeading, { color: theme.textMuted }]}>Bezpieczeństwo i Dostęp</Text>

              {Platform.OS !== 'web' && (
                <View style={[styles.settingRow, { borderColor: theme.cardBorder, backgroundColor: theme.cardSecondary }]}>
                  <View style={styles.settingText}>
                    <Text style={[styles.settingTitle, { color: theme.textPrimary }]}>PIN aplikacji</Text>
                    <Text style={[styles.settingDesc, { color: theme.textSecondary }]}>
                      6 cyfr · lokalny skarbiec Keystore / Keychain + bcrypt na serwerze
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.actionBtn, { borderColor: theme.primary }]}
                    onPress={() => setPinChangeVisible(true)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.actionBtnText, { color: theme.primary }]}>Zmień</Text>
                  </TouchableOpacity>
                </View>
              )}

              <View style={[styles.settingRow, { borderColor: theme.cardBorder, backgroundColor: theme.cardSecondary }]}>
                <View style={styles.settingText}>
                  <Text style={[styles.settingTitle, { color: theme.textPrimary }]}>Weryfikacja dwuetapowa (2FA)</Text>
                  <Text style={[styles.settingDesc, { color: theme.textSecondary }]}>
                    {totpLoading
                      ? 'Weryfikacja stanu...'
                      : totpFactorId
                      ? 'Aktywna · Kody z aplikacji Google Authenticator'
                      : 'Nieaktywna · Wymagana do logowania na nowych urządzeniach'}
                  </Text>
                </View>
                {totpLoading ? (
                  <ActivityIndicator color={theme.primary} />
                ) : (
                  <TouchableOpacity
                    style={[styles.actionBtn, { borderColor: totpFactorId ? theme.expense : theme.primary }]}
                    onPress={totpFactorId ? handleTotpDisable : () => setTotpSetupVisible(true)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.actionBtnText, { color: totpFactorId ? theme.expense : theme.primary }]}>
                      {totpFactorId ? 'Wyłącz' : 'Włącz'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={[styles.settingRow, { borderColor: theme.cardBorder, backgroundColor: theme.cardSecondary, flexDirection: 'column', alignItems: 'stretch' }]}>
                <View style={styles.rowBetween}>
                  <View style={styles.settingText}>
                    <Text style={[styles.settingTitle, { color: theme.textPrimary }]}>Hasło do konta</Text>
                    <Text style={[styles.settingDesc, { color: theme.textSecondary }]}>
                      Wymaga potwierdzenia dotychczasowym hasłem
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.actionBtn, { borderColor: theme.primary }]}
                    onPress={togglePasswordChange}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.actionBtnText, { color: theme.primary }]}>
                      {passwordChangeOpen ? 'Zwiń' : 'Zmień'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {passwordChangeOpen && (
                  <Animated.View
                    style={{
                      maxHeight: passwordFormHeight,
                      opacity: passwordFormOpacity,
                      transform: [{ translateY: passwordFormTranslateY }],
                      overflow: 'hidden',
                    }}
                  >
                    <View style={[styles.passwordForm, { borderTopColor: theme.cardBorder }]}>
                      <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Obecne hasło</Text>
                      <TextInput
                        style={[styles.inputField, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.textPrimary }]}
                        placeholder="Wprowadź obecne hasło"
                        placeholderTextColor={theme.textMuted}
                        secureTextEntry
                        value={currentPassword}
                        onChangeText={setCurrentPassword}
                      />

                      <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Nowe hasło (min. 8 znaków)</Text>
                      <TextInput
                        style={[styles.inputField, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.textPrimary }]}
                        placeholder="Minimum 8 znaków"
                        placeholderTextColor={theme.textMuted}
                        secureTextEntry
                        value={newPassword}
                        onChangeText={setNewPassword}
                      />

                      <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Powtórz nowe hasło</Text>
                      <TextInput
                        style={[styles.inputField, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.textPrimary }]}
                        placeholder="Powtórz nowe hasło"
                        placeholderTextColor={theme.textMuted}
                        secureTextEntry
                        value={confirmNewPassword}
                        onChangeText={setConfirmNewPassword}
                      />

                      {passwordMessage && (
                        <View style={[styles.statusBox, { backgroundColor: passwordMessage.type === 'error' ? theme.expenseSoft : theme.incomeSoft, borderColor: passwordMessage.type === 'error' ? theme.expense : theme.income }]}>
                          <Text style={[styles.statusText, { color: passwordMessage.type === 'error' ? theme.expense : theme.income }]}>
                            {passwordMessage.text}
                          </Text>
                        </View>
                      )}

                      <TouchableOpacity
                        style={[styles.submitPasswordBtn, { backgroundColor: theme.primary }]}
                        onPress={handlePasswordChangeSubmit}
                        disabled={passwordLoading}
                        activeOpacity={0.85}
                      >
                        {passwordLoading ? (
                          <ActivityIndicator color={theme.primaryForeground} />
                        ) : (
                          <Text style={[styles.submitPasswordBtnText, { color: theme.primaryForeground }]}>Zatwierdź nowe hasło</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </Animated.View>
                )}
              </View>

              <Text style={[styles.sectionHeading, { color: theme.textMuted, marginTop: 22 }]}>Bezpieczeństwo sieciowe i TLS</Text>

              <View style={[styles.settingRow, { borderColor: theme.cardBorder, backgroundColor: theme.cardSecondary }]}>
                <View style={styles.settingText}>
                  <Text style={[styles.settingTitle, { color: theme.textPrimary }]}>Przypinanie certyfikatów (Pinning)</Text>
                  <Text style={[styles.settingDesc, { color: theme.textSecondary }]}>
                    SPKI SHA-256 dla *.supabase.co (Leaf, WE1, GTS Root R4)
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.actionBtn, { borderColor: theme.primary }]}
                  onPress={handleCheckPinning}
                  disabled={pinningTesting}
                  activeOpacity={0.7}
                >
                  {pinningTesting ? (
                    <ActivityIndicator size="small" color={theme.primary} />
                  ) : (
                    <Text style={[styles.actionBtnText, { color: theme.primary }]}>Sprawdź</Text>
                  )}
                </TouchableOpacity>
              </View>

              <View style={[styles.settingRow, { borderColor: theme.cardBorder, backgroundColor: theme.cardSecondary }]}>
                <View style={styles.settingText}>
                  <Text style={[styles.settingTitle, { color: theme.textPrimary }]}>Android Network Security Config</Text>
                  <Text style={[styles.settingDesc, { color: theme.textSecondary }]}>
                    Tylko CA systemowe · Blokada certyfikatów użytkownika i HTTP
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.actionBtn, { borderColor: theme.cardBorder }]}
                  onPress={handleSimulateMitm}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.actionBtnText, { color: theme.primary }]}>Test MitM</Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.sectionHeading, { color: theme.textMuted, marginTop: 22 }]}>Dane rachunku i tożsamości</Text>

              <View style={[styles.settingRow, { borderColor: theme.cardBorder, backgroundColor: theme.cardSecondary }]}>
                <View style={styles.settingText}>
                  <Text style={[styles.settingTitle, { color: theme.textPrimary }]}>Numer rachunku (NRB/IBAN)</Text>
                  <Text style={[styles.settingDesc, { color: theme.textPrimary, fontWeight: '600' }]}>
                    {account?.account_number || 'PL 10 1050 0099 ...'}
                  </Text>
                  <Text style={[styles.infoNote, { color: theme.textMuted }]}>
                    Niezmienny identyfikator rachunku bankowego (PLN)
                  </Text>
                </View>
              </View>

              <View style={[styles.settingRow, { borderColor: theme.cardBorder, backgroundColor: theme.cardSecondary }]}>
                <View style={styles.settingText}>
                  <Text style={[styles.settingTitle, { color: theme.textPrimary }]}>Numer PESEL</Text>
                  <Text style={[styles.settingDesc, { color: theme.textMuted }]}>
                    Zabezpieczony przed modyfikacją
                  </Text>
                  <Text style={[styles.infoNote, { color: theme.textMuted }]}>
                    Zgodnie z procedurą bankową zmiana danych osobowych wymaga fizycznej weryfikacji tożsamości w oddziale.
                  </Text>
                </View>
              </View>

              <View style={[styles.settingRow, { borderColor: theme.cardBorder, backgroundColor: theme.cardSecondary }]}>
                <View style={styles.settingText}>
                  <Text style={[styles.settingTitle, { color: theme.textPrimary }]}>Dzienny limit operacji</Text>
                  <Text style={[styles.settingDesc, { color: theme.textPrimary, fontWeight: '600' }]}>
                    {account?.daily_limit ? `${account.daily_limit.toLocaleString('pl-PL')} PLN` : '5 000,00 PLN'}
                  </Text>
                </View>
              </View>

              <Text style={[styles.sectionHeading, { color: theme.textMuted, marginTop: 22 }]}>Preferencje interfejsu</Text>

              <View style={[styles.settingRow, { borderColor: theme.cardBorder, backgroundColor: theme.cardSecondary }]}>
                <View style={styles.settingText}>
                  <Text style={[styles.settingTitle, { color: theme.textPrimary }]}>Prywatność salda</Text>
                  <Text style={[styles.settingDesc, { color: theme.textSecondary }]}>
                    {balanceVisible ? 'Środki widoczne na pulpicie' : 'Środki ukryte (•••••• PLN)'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.actionBtn, { borderColor: theme.cardBorder }]}
                  onPress={onToggleBalancePrivacy}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.actionBtnText, { color: theme.primary }]}>
                    {balanceVisible ? 'Ukryj' : 'Odkryj'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.footerInfo}>
                <Text style={[styles.footerText, { color: theme.textMuted }]}>
                  SecureBank Polska S.A. · Bezpieczeństwo aplikacji mobilnej
                </Text>
              </View>
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </Animated.View>

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
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 24,
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
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 19,
    fontWeight: '800',
    includeFontPadding: false,
  },
  closeButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  scrollContent: {
    paddingBottom: 30,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 18,
  },
  avatarLarge: {
    width: 52,
    height: 52,
    borderRadius: 16,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  avatarLargeText: {
    fontSize: 18,
    fontWeight: '800',
  },
  profileDetails: {
    flex: 1,
  },
  profileName: {
    fontSize: 16,
    fontWeight: '700',
  },
  profileEmail: {
    fontSize: 12,
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  roleBadge: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  idBadge: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
  },
  idBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    includeFontPadding: false,
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 10,
    marginLeft: 4,
    includeFontPadding: false,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingText: {
    flex: 1,
    marginRight: 10,
  },
  settingTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  settingDesc: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  infoNote: {
    fontSize: 11,
    marginTop: 4,
    fontStyle: 'italic',
  },
  actionBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  passwordForm: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 5,
    marginTop: 8,
    textTransform: 'uppercase',
    includeFontPadding: false,
  },
  inputField: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  statusBox: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 10,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  submitPasswordBtn: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 14,
  },
  submitPasswordBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  footerInfo: {
    marginTop: 20,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 11,
    fontWeight: '500',
  },
});
