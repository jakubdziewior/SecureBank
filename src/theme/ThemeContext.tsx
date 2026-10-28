import React, { createContext, useContext, useState, useRef } from 'react';
import { useColorScheme, Animated, StyleSheet } from 'react-native';

export interface ThemeColors {
  background: string;
  card: string;
  cardBorder: string;
  cardSecondary: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  primary: string;
  primaryForeground: string;
  primarySoft: string;
  accent: string;
  income: string;
  incomeSoft: string;
  expense: string;
  expenseSoft: string;
  inputBg: string;
  inputBorder: string;
  inputFocusBorder: string;
  statusOnline: string;
  statusOffline: string;
  statusChecking: string;
  statusBar: 'light' | 'dark';
}

export const darkTheme: ThemeColors = {
  background: '#090D16',
  card: '#111726',
  cardBorder: '#1E293B',
  cardSecondary: '#172033',
  textPrimary: '#F8FAFC',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  primary: '#2563EB',
  primaryForeground: '#FFFFFF',
  primarySoft: 'rgba(37, 99, 235, 0.12)',
  accent: '#38BDF8',
  income: '#10B981',
  incomeSoft: 'rgba(16, 185, 129, 0.12)',
  expense: '#F43F5E',
  expenseSoft: 'rgba(244, 63, 94, 0.12)',
  inputBg: '#090D16',
  inputBorder: '#1E293B',
  inputFocusBorder: '#2563EB',
  statusOnline: '#10B981',
  statusOffline: '#F43F5E',
  statusChecking: '#F59E0B',
  statusBar: 'light',
};

export const lightTheme: ThemeColors = {
  background: '#F8FAFC',
  card: '#FFFFFF',
  cardBorder: '#E2E8F0',
  cardSecondary: '#F1F5F9',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  primary: '#1D4ED8',
  primaryForeground: '#FFFFFF',
  primarySoft: 'rgba(29, 78, 216, 0.08)',
  accent: '#0284C7',
  income: '#059669',
  incomeSoft: 'rgba(5, 150, 105, 0.1)',
  expense: '#E11D48',
  expenseSoft: 'rgba(225, 29, 72, 0.08)',
  inputBg: '#FFFFFF',
  inputBorder: '#CBD5E1',
  inputFocusBorder: '#1D4ED8',
  statusOnline: '#059669',
  statusOffline: '#E11D48',
  statusChecking: '#D97706',
  statusBar: 'dark',
};

interface ThemeContextType {
  theme: ThemeColors;
  isDark: boolean;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: darkTheme,
  isDark: true,
  toggleTheme: () => {},
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemScheme = useColorScheme();
  const [isDark, setIsDark] = useState<boolean>(systemScheme !== 'light');
  const [overlayColor, setOverlayColor] = useState<string>('#F8FAFC');
  const transitionAnim = useRef(new Animated.Value(0)).current;

  const toggleTheme = () => {
    const nextIsDark = !isDark;
    setOverlayColor(nextIsDark ? darkTheme.background : lightTheme.background);

    Animated.timing(transitionAnim, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      setIsDark(nextIsDark);
      Animated.timing(transitionAnim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }).start();
    });
  };

  const currentTheme = isDark ? darkTheme : lightTheme;

  return (
    <ThemeContext.Provider value={{ theme: currentTheme, isDark, toggleTheme }}>
      {children}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: overlayColor,
            opacity: transitionAnim,
            zIndex: 9999,
          },
        ]}
      />
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
