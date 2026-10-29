import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

interface PinPadProps {
  length: number;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: boolean;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

export const PinPad: React.FC<PinPadProps> = ({ length, value, onChange, disabled, error }) => {
  const { theme } = useTheme();

  const handleKey = (key: string) => {
    if (disabled) return;
    if (key === 'del') {
      onChange(value.slice(0, -1));
    } else if (key && value.length < length) {
      onChange(value + key);
    }
  };

  return (
    <View>
      <View style={styles.dotsRow}>
        {Array.from({ length }, (_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              {
                borderColor: error ? theme.expense : theme.primary,
                backgroundColor: i < value.length ? (error ? theme.expense : theme.primary) : 'transparent',
              },
            ]}
          />
        ))}
      </View>

      <View style={styles.grid}>
        {KEYS.map((key, i) =>
          key === '' ? (
            <View key={i} style={styles.key} />
          ) : (
            <TouchableOpacity
              key={i}
              style={[
                styles.key,
                key !== 'del' && { backgroundColor: theme.cardSecondary, borderColor: theme.cardBorder, borderWidth: 1 },
              ]}
              onPress={() => handleKey(key)}
              disabled={disabled}
              activeOpacity={0.6}
            >
              <Text style={[key === 'del' ? styles.delText : styles.keyText, { color: theme.textPrimary }]}>
                {key === 'del' ? 'Usuń' : key}
              </Text>
            </TouchableOpacity>
          )
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 14,
    marginBottom: 28,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 14,
  },
  key: {
    width: '30%',
    aspectRatio: 1.6,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyText: {
    width: '100%',
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '600',
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
    fontVariant: ['tabular-nums'],
    transform: [{ translateY: -8 }],
  },
  delText: {
    width: '100%',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
});
