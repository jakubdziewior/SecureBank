import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
} from 'react-native';
import { supabase, checkSupabaseConnection } from '../services/supabase';
import { useTheme } from '../theme/ThemeContext';
import { ThemeToggle } from '../components/ThemeToggle';

interface LoginScreenProps {
  onLoginSuccess: (session: any) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const { theme, isDark } = useTheme();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [loading, setLoading] = useState(false);

  const [emailError, setEmailError] = useState(false);
  const [passwordError, setPasswordError] = useState(false);
  const [trackWidth, setTrackWidth] = useState(0);

  const [banner, setBanner] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  const [isConnected, setIsConnected] = useState<boolean | null>(null);

  const tabAnim = useRef(new Animated.Value(0)).current;
  const buttonFadeAnim = useRef(new Animated.Value(1)).current;
  const bannerAnim = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    verifyConnection();
  }, []);

  const verifyConnection = async () => {
    const status = await checkSupabaseConnection();
    setIsConnected(status.connected);
  };

  const triggerShake = () => {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: -6, duration: 40, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6, duration: 40, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -4, duration: 40, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 4, duration: 40, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 40, useNativeDriver: true }),
    ]).start();
  };

  const showFeedback = (type: 'success' | 'error' | 'info', msg: string) => {
    setBanner({ type, message: msg });
    bannerAnim.setValue(0);
    Animated.spring(bannerAnim, {
      toValue: 1,
      damping: 14,
      stiffness: 190,
      useNativeDriver: true,
    }).start();

    if (type === 'error') {
      triggerShake();
    }
  };

  const hideFeedback = () => {
    if (!banner) return;
    Animated.timing(bannerAnim, {
      toValue: 0,
      duration: 120,
      useNativeDriver: true,
    }).start(() => {
      setBanner(null);
    });
  };

  const handleTabChange = (registerMode: boolean) => {
    if (isRegistering === registerMode) return;

    hideFeedback();
    setEmailError(false);
    setPasswordError(false);

    Animated.parallel([
      Animated.spring(tabAnim, {
        toValue: registerMode ? 1 : 0,
        damping: 20,
        stiffness: 220,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(buttonFadeAnim, {
          toValue: 0.3,
          duration: 70,
          useNativeDriver: true,
        }),
        Animated.timing(buttonFadeAnim, {
          toValue: 1,
          duration: 120,
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    setIsRegistering(registerMode);
  };

  const validateInput = (): boolean => {
    let errEmail = false;
    let errPass = false;
    let hasError = false;

    if (!email.trim() && !password) {
      errEmail = true;
      errPass = true;
      showFeedback('error', 'Wprowadź adres e-mail oraz hasło.');
      hasError = true;
    } else if (!email.trim()) {
      errEmail = true;
      showFeedback('error', 'Wprowadź adres e-mail.');
      hasError = true;
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        errEmail = true;
        showFeedback('error', 'Wprowadź poprawny format adresu e-mail.');
        hasError = true;
      }
    }

    if (!hasError && !password) {
      errPass = true;
      showFeedback('error', 'Wprowadź hasło dostępowe.');
      hasError = true;
    } else if (!hasError && password.length < 8) {
      errPass = true;
      showFeedback('error', 'Hasło musi zawierać co najmniej 8 znaków.');
      hasError = true;
    }

    setEmailError(errEmail);
    setPasswordError(errPass);
    return !hasError;
  };

  const handleAuth = async () => {
    if (!validateInput()) return;

    setLoading(true);
    hideFeedback();

    const cleanEmail = email.trim().toLowerCase();

    try {
      if (isRegistering) {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
        });

        if (error) throw error;

        if (data.session) {
          onLoginSuccess(data.session);
        } else if (data.user) {
          const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email: cleanEmail,
            password,
          });

          if (!signInError && signInData.session) {
            onLoginSuccess(signInData.session);
          } else {
            handleTabChange(false);
            showFeedback(
              'info',
              'Konto zostało zarejestrowane. Zaloguj się przy użyciu podanych danych.'
            );
          }
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (error) throw error;

        if (data.session) {
          onLoginSuccess(data.session);
        }
      }
    } catch (error: any) {
      let userFriendlyMsg = error?.message || 'Błąd uwierzytelniania.';
      if (userFriendlyMsg.includes('User already registered')) {
        userFriendlyMsg = 'Użytkownik o tym adresie e-mail już istnieje. Zaloguj się.';
      } else if (userFriendlyMsg.includes('Invalid login credentials')) {
        userFriendlyMsg = 'Niepoprawny login lub hasło.';
        setPasswordError(true);
      }
      showFeedback('error', userFriendlyMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleBiometricAuth = () => {
    showFeedback(
      'info',
      'Autoryzacja biometryczna zostanie aktywowana po pierwszym pomyślnym logowaniu.'
    );
  };

  const pillShift = trackWidth > 0 ? (trackWidth - 6) / 2 : 140;
  const pillTranslateX = tabAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, pillShift],
  });

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.keyboardContainer}
    >
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
          alwaysBounceVertical={false}
          overScrollMode="never"
        >
          <View style={styles.topControlRow}>
            <View
              style={[
                styles.statusBar,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.cardBorder,
                },
              ]}
            >
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor:
                      isConnected === true
                        ? theme.statusOnline
                        : isConnected === false
                        ? theme.statusOffline
                        : theme.statusChecking,
                  },
                ]}
              />
              <Text style={[styles.statusLabel, { color: theme.textSecondary }]}>
                {isConnected === true
                  ? 'System online'
                  : isConnected === false
                  ? 'Brak połączenia'
                  : 'Łączenie...'}
              </Text>
            </View>

            <ThemeToggle />
          </View>

          <View style={styles.brandContainer}>
            <View
              style={[
                styles.logoBadge,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.primary,
                  shadowColor: theme.primary,
                },
              ]}
            >
              <Text style={[styles.logoLetter, { color: theme.primary }]}>S</Text>
            </View>
            <Text style={[styles.brandTitle, { color: theme.textPrimary }]}>SecureBank</Text>
            <Text style={[styles.brandSubtitle, { color: theme.textSecondary }]}>
              Bankowość mobilna nowej generacji
            </Text>
          </View>

          <Animated.View
            style={[
              styles.card,
              {
                backgroundColor: theme.card,
                borderColor: theme.cardBorder,
                shadowColor: isDark ? '#000000' : '#64748B',
                transform: [{ translateX: shakeAnim }],
              },
            ]}
          >
            <View
              onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
              style={[
                styles.tabTrack,
                {
                  backgroundColor: theme.cardSecondary,
                  borderColor: theme.cardBorder,
                },
              ]}
            >
              <Animated.View
                style={[
                  styles.tabActivePill,
                  {
                    width: trackWidth > 0 ? (trackWidth - 6) / 2 : '48%',
                    transform: [{ translateX: pillTranslateX }],
                    backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                    borderColor: theme.cardBorder,
                  },
                ]}
              />
              <TouchableOpacity
                style={styles.tabButton}
                onPress={() => handleTabChange(false)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.tabButtonText,
                    {
                      color: !isRegistering ? theme.textPrimary : theme.textMuted,
                      fontWeight: !isRegistering ? '700' : '500',
                    },
                  ]}
                >
                  Logowanie
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.tabButton}
                onPress={() => handleTabChange(true)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.tabButtonText,
                    {
                      color: isRegistering ? theme.textPrimary : theme.textMuted,
                      fontWeight: isRegistering ? '700' : '500',
                    },
                  ]}
                >
                  Rejestracja
                </Text>
              </TouchableOpacity>
            </View>

            {banner && (
              <Animated.View
                style={[
                  styles.banner,
                  {
                    opacity: bannerAnim,
                    transform: [
                      {
                        translateY: bannerAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [-8, 0],
                        }),
                      },
                      {
                        scale: bannerAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.96, 1],
                        }),
                      },
                    ],
                    backgroundColor:
                      banner.type === 'success'
                        ? theme.incomeSoft
                        : banner.type === 'error'
                        ? theme.expenseSoft
                        : theme.primarySoft,
                    borderColor:
                      banner.type === 'success'
                        ? theme.income
                        : banner.type === 'error'
                        ? theme.expense
                        : theme.primary,
                  },
                ]}
              >
                <View
                  style={[
                    styles.bannerDot,
                    {
                      backgroundColor:
                        banner.type === 'success'
                          ? theme.income
                          : banner.type === 'error'
                          ? theme.expense
                          : theme.primary,
                    },
                  ]}
                />
                <Text style={[styles.bannerMessage, { color: theme.textPrimary }]}>
                  {banner.message}
                </Text>
              </Animated.View>
            )}

            <View style={styles.inputContainer}>
              <Text style={[styles.inputLabel, { color: emailError ? theme.expense : theme.textMuted }]}>
                Adres e-mail
              </Text>
              <TextInput
                style={[
                  styles.inputField,
                  {
                    backgroundColor: theme.inputBg,
                    borderColor: emailError ? theme.expense : theme.inputBorder,
                    color: theme.textPrimary,
                  },
                ]}
                placeholder="uzytkownik@securebank.pl"
                placeholderTextColor={theme.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  if (emailError) setEmailError(false);
                  if (banner) hideFeedback();
                }}
              />
            </View>

            <View style={styles.inputContainer}>
              <View style={styles.inputHeaderRow}>
                <Text style={[styles.inputLabel, { color: passwordError ? theme.expense : theme.textMuted }]}>
                  Hasło
                </Text>
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  <Text style={[styles.passwordToggleText, { color: theme.primary }]}>
                    {showPassword ? 'Ukryj' : 'Pokaż'}
                  </Text>
                </TouchableOpacity>
              </View>
              <TextInput
                style={[
                  styles.inputField,
                  {
                    backgroundColor: theme.inputBg,
                    borderColor: passwordError ? theme.expense : theme.inputBorder,
                    color: theme.textPrimary,
                  },
                ]}
                placeholder="Minimum 8 znaków"
                placeholderTextColor={theme.textMuted}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  if (passwordError) setPasswordError(false);
                  if (banner) hideFeedback();
                }}
              />
            </View>

            <Animated.View style={{ opacity: buttonFadeAnim }}>
              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  { backgroundColor: theme.primary },
                  loading && styles.buttonDisabled,
                ]}
                onPress={handleAuth}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color={theme.primaryForeground} />
                ) : (
                  <Text style={[styles.primaryButtonText, { color: theme.primaryForeground }]}>
                    {isRegistering ? 'Utwórz konto' : 'Zaloguj się'}
                  </Text>
                )}
              </TouchableOpacity>

              {!isRegistering && (
                <TouchableOpacity
                  style={[
                    styles.secondaryButton,
                    {
                      borderColor: theme.cardBorder,
                      backgroundColor: theme.cardSecondary,
                    },
                  ]}
                  onPress={handleBiometricAuth}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.secondaryButtonText, { color: theme.textSecondary }]}>
                    Zaloguj za pomocą biometrii
                  </Text>
                </TouchableOpacity>
              )}
            </Animated.View>
          </Animated.View>

          <View style={styles.footer}>
            <Text style={[styles.footerLegal, { color: theme.textMuted }]}>
              SecureBank Polska S.A. System bankowy
            </Text>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  keyboardContainer: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  scrollContainer: {
    paddingHorizontal: 22,
    paddingTop: 48,
    paddingBottom: 32,
    justifyContent: 'center',
    minHeight: '100%',
  },
  topControlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 8,
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  brandContainer: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logoBadge: {
    width: 58,
    height: 58,
    borderRadius: 18,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
  logoLetter: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  brandTitle: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  brandSubtitle: {
    fontSize: 13,
    marginTop: 4,
    fontWeight: '500',
  },
  card: {
    borderRadius: 22,
    padding: 22,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
  tabTrack: {
    position: 'relative',
    flexDirection: 'row',
    height: 44,
    borderRadius: 12,
    padding: 3,
    marginBottom: 20,
    borderWidth: 1,
  },
  tabActivePill: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    left: 3,
    borderRadius: 9,
    borderWidth: 0.5,
  },
  tabButton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  tabButtonText: {
    fontSize: 13,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 16,
    borderWidth: 1,
  },
  bannerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 9,
  },
  bannerMessage: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  passwordToggleText: {
    fontSize: 12,
    fontWeight: '600',
  },
  inputField: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 15,
  },
  primaryButton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  secondaryButton: {
    marginTop: 10,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  footer: {
    marginTop: 32,
    alignItems: 'center',
  },
  footerLegal: {
    fontSize: 11,
    fontWeight: '500',
  },
});
