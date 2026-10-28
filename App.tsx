import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, ActivityIndicator, Animated } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { supabase } from './src/services/supabase';
import { LoginScreen } from './src/screens/LoginScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';

const MainNavigator = () => {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const { theme, isDark } = useTheme();

  const screenTransition = useRef(new Animated.Value(1)).current;
  const currentUserIdRef = useRef<string | null>(null);
  const isTransitioningRef = useRef<boolean>(false);

  const transitionToSession = (newSession: any) => {
    const newUserId = newSession?.user?.id ?? null;

    if (newUserId === currentUserIdRef.current) {
      setSession(newSession);
      return;
    }

    if (isTransitioningRef.current) {
      currentUserIdRef.current = newUserId;
      setSession(newSession);
      return;
    }

    isTransitioningRef.current = true;
    currentUserIdRef.current = newUserId;

    Animated.timing(screenTransition, {
      toValue: 0,
      duration: 140,
      useNativeDriver: true,
    }).start(() => {
      setSession(newSession);
      setTimeout(() => {
        Animated.timing(screenTransition, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }).start(() => {
          isTransitioningRef.current = false;
        });
      }, 30);
    });
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      currentUserIdRef.current = initialSession?.user?.id ?? null;
      setSession(initialSession);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      transitionToSession(newSession);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleLoginSuccess = (newSession: any) => {
    transitionToSession(newSession);
  };

  const handleLogout = () => {
    transitionToSession(null);
  };

  if (loading) {
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
        {session && session.user ? (
          <HomeScreen session={session} onLogout={handleLogout} />
        ) : (
          <LoginScreen onLoginSuccess={handleLoginSuccess} />
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
