import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, ActivityIndicator, Animated, AppState, AppStateStatus, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  supabase,
  resealStoredSession,
  clearStoredSession,
  discardPendingSession,
  hasEncryptedStoredSession,
} from './src/services/supabase';
import {
  PinUnlockResult,
  PinVaultInfo,
  createPin,
  deletePinVault,
  getPinVaultInfo,
  isSessionUnlocked,
  lockSession,
  rewrapPin,
  unlockWithPin,
} from './src/services/pin';
import { getAccountPinStatus, setAccountPin, verifyAccountPin } from './src/services/accountPin';
import { isMfaVerificationRequired } from './src/services/mfa';
import { LoginScreen } from './src/screens/LoginScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { PinScreen } from './src/screens/PinScreen';
import { MfaVerifyScreen } from './src/screens/MfaVerifyScreen';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';

const LOCK_AFTER_BACKGROUND_MS = 30000;
const PIN_SUPPORTED = Platform.OS !== 'web';

type Gate = 'loading' | 'login' | 'mfa' | 'pinSetup' | 'pinConfirm' | 'pinUnlock' | 'home';

const MainNavigator = () => {
  const [session, setSession] = useState<any>(null);
  const [gate, setGate] = useState<Gate>('loading');
  const [vaultInfo, setVaultInfo] = useState<PinVaultInfo | null>(null);
  const [pinChangedElsewhere, setPinChangedElsewhere] = useState(false);
  const { theme, isDark } = useTheme();

  const screenTransition = useRef(new Animated.Value(1)).current;
  const gateRef = useRef<Gate>('loading');
  const refreshIdRef = useRef(0);
  const pinResetRequestedRef = useRef(false);
  const passwordLoginRef = useRef(false);
  const backgroundedAtRef = useRef<number | null>(null);

  const applyGate = (nextGate: Gate, nextSession: any) => {
    if (nextGate === gateRef.current) {
      setSession(nextSession);
      return;
    }
    const fromLoading = gateRef.current === 'loading';
    gateRef.current = nextGate;

    if (fromLoading) {
      setSession(nextSession);
      setGate(nextGate);
      return;
    }

    Animated.timing(screenTransition, {
      toValue: 0,
      duration: 140,
      useNativeDriver: true,
    }).start(() => {
      setSession(nextSession);
      setGate(nextGate);
      setTimeout(() => {
        Animated.timing(screenTransition, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }).start();
      }, 30);
    });
  };

  const refreshGate = async () => {
    const refreshId = ++refreshIdRef.current;

    const info = PIN_SUPPORTED ? await getPinVaultInfo() : null;
    const unlocked = isSessionUnlocked();
    const storedSessionLocked = !!info && !unlocked && (await hasEncryptedStoredSession());
    const currentSession = storedSessionLocked ? null : (await supabase.auth.getSession()).data.session;

    if (gateRef.current === 'login' && currentSession?.user) {
      passwordLoginRef.current = true;
    }

    let nextGate: Gate;
    let changedElsewhere = false;
    if (storedSessionLocked) {
      nextGate = 'pinUnlock';
    } else if (!currentSession?.user) {
      nextGate = 'login';
    } else if (await isMfaVerificationRequired()) {
      nextGate = 'mfa';
    } else if (!PIN_SUPPORTED) {
      nextGate = 'home';
    } else {
      const localVaultMatches = unlocked && info?.userId === currentSession.user.id;
      const skipPinConfirm = passwordLoginRef.current && !unlocked;
      let status: { hasPin: boolean; version: number | null } | null = null;
      try {
        status = await getAccountPinStatus();
      } catch {
        status = null;
      }

      if (!status) {
        nextGate = localVaultMatches || skipPinConfirm ? 'home' : 'pinConfirm';
      } else if (!status.hasPin || pinResetRequestedRef.current) {
        nextGate = 'pinSetup';
      } else if ((localVaultMatches && info?.pinVersion === status.version) || skipPinConfirm) {
        nextGate = 'home';
      } else {
        nextGate = 'pinConfirm';
        changedElsewhere = localVaultMatches;
      }
    }

    if (refreshId !== refreshIdRef.current) return;
    setVaultInfo(info);
    setPinChangedElsewhere(changedElsewhere);
    applyGate(nextGate, currentSession);
  };

  useEffect(() => {
    refreshGate();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      setTimeout(refreshGate, 0);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const lockApp = async () => {
    passwordLoginRef.current = false;
    if (isSessionUnlocked()) {
      await supabase.auth.stopAutoRefresh();
      lockSession();
      discardPendingSession();
    }
    await refreshGate();
  };

  useEffect(() => {
    const handleAppStateChange = async (nextState: AppStateStatus) => {
      if (nextState === 'background') {
        backgroundedAtRef.current = Date.now();
        return;
      }
      if (nextState !== 'active' || backgroundedAtRef.current === null) {
        return;
      }
      const elapsed = Date.now() - backgroundedAtRef.current;
      backgroundedAtRef.current = null;
      if (elapsed >= LOCK_AFTER_BACKGROUND_MS && gateRef.current === 'home' && PIN_SUPPORTED) {
        await lockApp();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, []);

  const handleFullLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
    }
    await clearStoredSession();
    lockSession();
    pinResetRequestedRef.current = false;
    passwordLoginRef.current = false;
    await refreshGate();
  };

  const handleForgotPin = async () => {
    await deletePinVault();
    await handleFullLogout();
    pinResetRequestedRef.current = true;
  };

  const storeLocalPin = async (pin: string, pinVersion: number) => {
    const user = session?.user;
    if (!user) return;
    if (isSessionUnlocked() && vaultInfo?.userId === user.id) {
      await rewrapPin(pin, pinVersion);
    } else {
      await createPin(pin, user.id, user.email ?? '', pinVersion);
      await resealStoredSession();
    }
    await supabase.auth.startAutoRefresh();
  };

  const handleLogout = async () => {
    if (PIN_SUPPORTED) {
      await lockApp();
      return;
    }
    await handleFullLogout();
  };

  const handlePinCreate = async (pin: string) => {
    const result = await setAccountPin(pin);
    if (!result.valid) {
      throw new Error(result.message);
    }
    await storeLocalPin(pin, result.version);
    pinResetRequestedRef.current = false;
    await refreshGate();
  };

  const handlePinConfirm = async (pin: string): Promise<PinUnlockResult> => {
    let result;
    try {
      result = await verifyAccountPin(pin);
    } catch (e: any) {
      return { success: false, wiped: false, attemptsLeft: 0, message: e?.message || 'Brak połączenia z serwerem.' };
    }
    if (result.valid) {
      await storeLocalPin(pin, result.version);
      await refreshGate();
      return { success: true };
    }
    if (result.reset) {
      await handleForgotPin();
    }
    return { success: false, wiped: result.reset, attemptsLeft: result.attemptsLeft, message: result.message };
  };

  const handlePinUnlock = async (pin: string) => {
    const result = await unlockWithPin(pin);
    if (result.success) {
      await resealStoredSession();
      await supabase.auth.startAutoRefresh();
      await refreshGate();
    } else if (result.wiped) {
      await handleForgotPin();
    }
    return result;
  };

  if (gate === 'loading') {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
        <StatusBar style={isDark ? 'light' : 'dark'} />
      </View>
    );
  }

  const screenAnimatedStyle = {
    opacity: screenTransition,
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Animated.View style={[styles.screenWrapper, screenAnimatedStyle]}>
        {gate === 'pinUnlock' || gate === 'pinConfirm' ? (
          <PinScreen
            key={gate}
            mode={gate === 'pinUnlock' ? 'unlock' : 'confirm'}
            email={vaultInfo?.email}
            subtitle={pinChangedElsewhere ? 'PIN został zmieniony na innym urządzeniu. Wpisz nowy PIN.' : undefined}
            onUnlock={gate === 'pinUnlock' ? handlePinUnlock : handlePinConfirm}
            onCancel={handleFullLogout}
            onForgot={handleForgotPin}
          />
        ) : gate === 'mfa' ? (
          <MfaVerifyScreen email={session?.user?.email} onVerified={refreshGate} onCancel={handleFullLogout} />
        ) : gate === 'pinSetup' ? (
          <PinScreen mode="setup" email={session?.user?.email} onCreate={handlePinCreate} onCancel={handleFullLogout} />
        ) : gate === 'home' && session?.user ? (
          <HomeScreen session={session} onLogout={handleLogout} onPinLocked={handleFullLogout} />
        ) : (
          <LoginScreen onLoginSuccess={refreshGate} />
        )}
      </Animated.View>
    </View>
  );
};

export default function App() {
  return (
    <ThemeProvider>
      <MainNavigator />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  screenWrapper: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
