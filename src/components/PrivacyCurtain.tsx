import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

export const PrivacyCurtain: React.FC = () => {
  const { theme } = useTheme();
  return (
    <View style={[StyleSheet.absoluteFill, styles.curtain, { backgroundColor: theme.background }]} pointerEvents="none">
      <Text style={[styles.logo, { color: theme.primary }]}>SecureBank</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  curtain: {
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    elevation: 1000,
  },
  logo: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
