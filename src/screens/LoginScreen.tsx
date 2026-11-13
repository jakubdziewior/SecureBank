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
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [pesel, setPesel] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [loading, setLoading] = useState(false);

  const [emailError, setEmailError] = useState(false);
  const [passwordError, setPasswordError] = useState(false);
  const [confirmPasswordError, setConfirmPasswordError] = useState(false);
  const [firstNameError, setFirstNameError] = useState(false);
  const [lastNameError, setLastNameError] = useState(false);
  const [peselError, setPeselError] = useState(false);

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

  const clearValidationErrors = () => {
    setEmailError(false);
    setPasswordError(false);
    setConfirmPasswordError(false);
    setFirstNameError(false);
    setLastNameError(false);
    setPeselError(false);
  };

  const handleTabChange = (registerMode: boolean) => {
    if (isRegistering === registerMode) return;

    hideFeedback();
    clearValidationErrors();

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

  const generateClientNumber = (): string => {
    return Math.floor(10000000 + Math.random() * 90000000).toString();
  };

  const generateAccountNumber = (): string => {
    const checkDigits = Math.floor(10 + Math.random() * 89).toString();
    const bankCode = '1050 0099';
    const p1 = Math.floor(1000 + Math.random() * 9000).toString();
    const p2 = Math.floor(1000 + Math.random() * 9000).toString();
    const p3 = Math.floor(1000 + Math.random() * 9000).toString();
    const p4 = Math.floor(1000 + Math.random() * 9000).toString();
    return `PL ${checkDigits} ${bankCode} ${p1} ${p2} ${p3} ${p4}`;
  };

  const validateInput = (): boolean => {
    clearValidationErrors();

    if (isRegistering) {
      if (!firstName.trim()) {
        setFirstNameError(true);
        showFeedback('error', 'Wprowadź imię.');
        return false;
      }

      if (!lastName.trim()) {
        setLastNameError(true);
        showFeedback('error', 'Wprowadź nazwisko.');
        return false;
      }

      const cleanPesel = pesel.trim();
      if (!cleanPesel) {
        setPeselError(true);
        showFeedback('error', 'Wprowadź numer PESEL.');
        return false;
      }
      if (!/^\d{11}$/.test(cleanPesel)) {
        setPeselError(true);
        showFeedback('error', 'Numer PESEL musi składać się z dokładnie 11 cyfr.');
        return false;
      }

      if (!email.trim()) {
        setEmailError(true);
        showFeedback('error', 'Wprowadź adres e-mail.');
        return false;
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        setEmailError(true);
        showFeedback('error', 'Wprowadź poprawny format adresu e-mail.');
        return false;
      }

      if (!password) {
        setPasswordError(true);
        showFeedback('error', 'Wprowadź hasło dostępowe.');
        return false;
      }
      if (password.length < 8) {
        setPasswordError(true);
        showFeedback('error', 'Hasło musi zawierać co najmniej 8 znaków.');
        return false;
      }

      if (!confirmPassword) {
        setConfirmPasswordError(true);
        showFeedback('error', 'Powtórz wprowadzone hasło.');
        return false;
      }
      if (password !== confirmPassword) {
        setConfirmPasswordError(true);
        showFeedback('error', 'Wprowadzone hasła różnią się od siebie.');
        return false;
      }

      return true;
    }

    if (!email.trim()) {
      setEmailError(true);
      showFeedback('error', 'Wprowadź adres e-mail lub 8-cyfrowy numer klienta.');
      return false;
    }

    if (!password) {
      setPasswordError(true);
      showFeedback('error', 'Wprowadź hasło dostępowe.');
      return false;
    }
    if (password.length < 8) {
      setPasswordError(true);
      showFeedback('error', 'Hasło musi zawierać co najmniej 8 znaków.');
      return false;
    }

    return true;
  };

  const handleAuth = async () => {
    if (!validateInput()) return;

    setLoading(true);
    hideFeedback();

    const rawLogin = email.trim();

    try {
      if (isRegistering) {
        const cleanEmail = rawLogin.toLowerCase();
        const clientNumber = generateClientNumber();
        const accountNumber = generateAccountNumber();

        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: {
              first_name: firstName.trim(),
              last_name: lastName.trim(),
              pesel: pesel.trim(),
              client_number: clientNumber,
              account_number: accountNumber,
            },
          },
        });

        if (error) throw error;

        if (data.user) {
          try {
            await supabase.from('profiles').upsert({
              id: data.user.id,
              first_name: firstName.trim(),
              last_name: lastName.trim(),
              pesel: pesel.trim(),
              client_number: clientNumber,
              role: 'client',
            });
            await supabase.from('accounts').upsert({
              user_id: data.user.id,
              account_number: accountNumber,
              currency: 'PLN',
              balance: 1000.0,
              daily_limit: 5000.0,
            });
          } catch {
          }
        }

        if (data.session) {
          onLoginSuccess(data.session);
        } else if (data.user) {
          const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email: cleanEmail,
            password,
          });

          if (!signInError && signInData?.session) {
            onLoginSuccess(signInData.session);
          } else {
            handleTabChange(false);
            setEmail(clientNumber);
            setPassword('');
            setConfirmPassword('');
            showFeedback(
              'success',
              `Konto utworzone. Twój numer klienta: ${clientNumber}. Zaloguj się.`
            );
          }
        }
      } else {
        let authEmail = rawLogin.toLowerCase();

        if (!authEmail.includes('@')) {
          try {
            const { data: rpcEmail, error: rpcError } = await supabase.rpc(
              'lookup_email_by_client_number',
              { p_client_number: rawLogin }
            );
            if (!rpcError && rpcEmail) {
              authEmail = String(rpcEmail).toLowerCase();
            }
          } catch {
          }
        }

        const { data, error } = await supabase.auth.signInWithPassword({
          email: authEmail,
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

            {isRegistering && (
              <>
                <View style={styles.inputContainer}>
                  <Text
                    style={[
                      styles.inputLabel,
                      { color: firstNameError ? theme.expense : theme.textMuted },
                    ]}
                  >
                    Imię
                  </Text>
                  <TextInput
                    style={[
                      styles.inputField,
                      {
                        backgroundColor: theme.inputBg,
                        borderColor: firstNameError ? theme.expense : theme.inputBorder,
                        color: theme.textPrimary,
                      },
                    ]}
                    placeholder="np. Jan"
                    placeholderTextColor={theme.textMuted}
                    autoCapitalize="words"
                    autoCorrect={false}
                    value={firstName}
                    onChangeText={(text) => {
                      setFirstName(text);
                      if (firstNameError) setFirstNameError(false);
                      if (banner) hideFeedback();
                    }}
                  />
                </View>

                <View style={styles.inputContainer}>
                  <Text
                    style={[
                      styles.inputLabel,
                      { color: lastNameError ? theme.expense : theme.textMuted },
                    ]}
                  >
                    Nazwisko
                  </Text>
                  <TextInput
                    style={[
                      styles.inputField,
                      {
                        backgroundColor: theme.inputBg,
                        borderColor: lastNameError ? theme.expense : theme.inputBorder,
                        color: theme.textPrimary,
                      },
                    ]}
                    placeholder="np. Kowalski"
                    placeholderTextColor={theme.textMuted}
                    autoCapitalize="words"
                    autoCorrect={false}
                    value={lastName}
                    onChangeText={(text) => {
                      setLastName(text);
                      if (lastNameError) setLastNameError(false);
                      if (banner) hideFeedback();
                    }}
                  />
                </View>

                <View style={styles.inputContainer}>
                  <Text
                    style={[
                      styles.inputLabel,
                      { color: peselError ? theme.expense : theme.textMuted },
                    ]}
                  >
                    Numer PESEL (11 cyfr)
                  </Text>
                  <TextInput
                    style={[
                      styles.inputField,
                      {
                        backgroundColor: theme.inputBg,
                        borderColor: peselError ? theme.expense : theme.inputBorder,
                        color: theme.textPrimary,
                      },
                    ]}
                    placeholder="np. 92010112345"
                    placeholderTextColor={theme.textMuted}
                    keyboardType="numeric"
                    maxLength={11}
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={pesel}
                    onChangeText={(text) => {
                      const digitsOnly = text.replace(/[^0-9]/g, '');
                      setPesel(digitsOnly);
                      if (peselError) setPeselError(false);
                      if (banner) hideFeedback();
                    }}
                  />
                </View>
              </>
            )}

            <View style={styles.inputContainer}>
              <Text
                style={[
                  styles.inputLabel,
                  { color: emailError ? theme.expense : theme.textMuted },
                ]}
              >
                {isRegistering ? 'Adres e-mail' : 'Adres e-mail lub Numer klienta'}
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
                placeholder={
                  isRegistering ? 'uzytkownik@securebank.pl' : 'np. 84729103 lub email'
                }
                placeholderTextColor={theme.textMuted}
                keyboardType={isRegistering ? 'email-address' : 'default'}
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
                <Text
                  style={[
                    styles.inputLabel,
                    { color: passwordError ? theme.expense : theme.textMuted },
                  ]}
                >
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

            {isRegistering && (
              <View style={styles.inputContainer}>
                <View style={styles.inputHeaderRow}>
                  <Text
                    style={[
                      styles.inputLabel,
                      { color: confirmPasswordError ? theme.expense : theme.textMuted },
                    ]}
                  >
                    Powtórz hasło
                  </Text>
                  <TouchableOpacity
                    onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    <Text style={[styles.passwordToggleText, { color: theme.primary }]}>
                      {showConfirmPassword ? 'Ukryj' : 'Pokaż'}
                    </Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={[
                    styles.inputField,
                    {
                      backgroundColor: theme.inputBg,
                      borderColor: confirmPasswordError
                        ? theme.expense
                        : theme.inputBorder,
                      color: theme.textPrimary,
                    },
                  ]}
                  placeholder="Powtórz hasło dostępowe"
                  placeholderTextColor={theme.textMuted}
                  secureTextEntry={!showConfirmPassword}
                  autoCapitalize="none"
                  value={confirmPassword}
                  onChangeText={(text) => {
                    setConfirmPassword(text);
                    if (confirmPasswordError) setConfirmPasswordError(false);
                    if (banner) hideFeedback();
                  }}
                />
              </View>
            )}

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
                  <Text
                    style={[
                      styles.primaryButtonText,
                      { color: theme.primaryForeground },
                    ]}
                  >
                    {isRegistering ? 'Utwórz konto' : 'Zaloguj się'}
                  </Text>
                )}
              </TouchableOpacity>
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
    includeFontPadding: false,
  },
  brandTitle: {
    fontSize: 28,
    fontWeight: '800',
    includeFontPadding: false,
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
    marginBottom: 14,
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
    includeFontPadding: false,
  },
  passwordToggleText: {
    fontSize: 12,
    fontWeight: '600',
  },
  inputField: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 0,
    height: 48,
    fontSize: 15,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  primaryButton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
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
    includeFontPadding: false,
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
