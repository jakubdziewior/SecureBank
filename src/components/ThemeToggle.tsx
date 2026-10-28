import React, { useEffect, useRef } from 'react';
import { StyleSheet, TouchableOpacity, View, Animated } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

export const ThemeToggle: React.FC = () => {
  const { theme, isDark, toggleTheme } = useTheme();
  const animValue = useRef(new Animated.Value(isDark ? 0 : 1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(animValue, {
        toValue: isDark ? 0 : 1,
        friction: 6,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 0.85,
          duration: 90,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 4,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [isDark]);

  const spin = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  return (
    <TouchableOpacity
      style={[
        styles.button,
        {
          backgroundColor: theme.cardSecondary,
          borderColor: theme.cardBorder,
        },
      ]}
      onPress={toggleTheme}
      activeOpacity={0.7}
      accessibilityLabel={isDark ? 'Przełącz na tryb jasny' : 'Przełącz na tryb ciemny'}
    >
      <Animated.View
        style={[
          styles.iconContainer,
          {
            transform: [{ rotate: spin }, { scale: scaleAnim }],
          },
        ]}
      >
        {isDark ? (
          <View style={styles.moonContainer}>
            <View style={[styles.moonBody, { backgroundColor: '#F8FAFC' }]} />
            <View
              style={[
                styles.moonCutout,
                { backgroundColor: theme.cardSecondary },
              ]}
            />
          </View>
        ) : (
          <View style={styles.sunContainer}>
            <View style={styles.sunCore} />
            <View style={[styles.sunRay, styles.rayTop]} />
            <View style={[styles.sunRay, styles.rayBottom]} />
            <View style={[styles.sunRay, styles.rayLeft]} />
            <View style={[styles.sunRay, styles.rayRight]} />
            <View style={[styles.sunRay, styles.rayTopRight]} />
            <View style={[styles.sunRay, styles.rayTopLeft]} />
            <View style={[styles.sunRay, styles.rayBottomRight]} />
            <View style={[styles.sunRay, styles.rayBottomLeft]} />
          </View>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    width: 22,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  moonContainer: {
    width: 18,
    height: 18,
    position: 'relative',
  },
  moonBody: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  moonCutout: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  sunContainer: {
    width: 22,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  sunCore: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#D97706',
  },
  sunRay: {
    position: 'absolute',
    backgroundColor: '#D97706',
    borderRadius: 1,
  },
  rayTop: {
    top: 1,
    width: 2,
    height: 3,
  },
  rayBottom: {
    bottom: 1,
    width: 2,
    height: 3,
  },
  rayLeft: {
    left: 1,
    width: 3,
    height: 2,
  },
  rayRight: {
    right: 1,
    width: 3,
    height: 2,
  },
  rayTopRight: {
    top: 3,
    right: 3,
    width: 2,
    height: 2,
  },
  rayTopLeft: {
    top: 3,
    left: 3,
    width: 2,
    height: 2,
  },
  rayBottomRight: {
    bottom: 3,
    right: 3,
    width: 2,
    height: 2,
  },
  rayBottomLeft: {
    bottom: 3,
    left: 3,
    width: 2,
    height: 2,
  },
});
