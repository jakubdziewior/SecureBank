import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { supabase } from '../services/supabase';
import { BankAccount, Transaction, UserProfile } from '../types';
import { useTheme } from '../theme/ThemeContext';
import { ThemeToggle } from '../components/ThemeToggle';
import { SecuritySection } from '../components/SecuritySection';

interface HomeScreenProps {
  session: any;
  onLogout: () => void;
  onPinLocked: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ session, onLogout, onPinLocked }) => {
  const { theme, isDark } = useTheme();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [account, setAccount] = useState<BankAccount | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [balanceVisible, setBalanceVisible] = useState(true);

  const balanceOpacity = useRef(new Animated.Value(1)).current;
  const balanceScale = useRef(new Animated.Value(1)).current;

  const userEmail = session?.user?.email || 'klient@securebank.pl';
  const userId = session?.user?.id || 'id-sesji';

  useEffect(() => {
    fetchUserData();
  }, []);

  const fetchUserData = async () => {
    setLoading(true);
    try {
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (!profileError && profileData) {
        setProfile(profileData);
      } else {
        setProfile({
          id: userId,
          first_name: 'Jan',
          last_name: 'Kowalski',
          pesel: '920101*****',
          role: 'client',
          is_blocked: false,
          two_factor_enabled: true,
          created_at: new Date().toISOString(),
        });
      }

      const { data: accountData, error: accountError } = await supabase
        .from('accounts')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (!accountError && accountData) {
        setAccount(accountData);
      } else {
        setAccount({
          id: 'acc-uuid-1',
          user_id: userId,
          account_number: 'PL 10 1050 0099 7654 3210 0001',
          currency: 'PLN',
          balance: 14250.75,
          daily_limit: 5000.0,
          created_at: new Date().toISOString(),
        });
      }

      const { data: transData, error: transError } = await supabase
        .from('transactions')
        .select('*')
        .limit(5);

      if (!transError && transData) {
        setTransactions(transData);
      } else {
        setTransactions([
          {
            id: 't-1',
            sender_account_id: 'acc-uuid-1',
            recipient_account_number: 'PL 20 1020 0003 1111 2222 3333',
            recipient_name: 'Płatność kartą / Sklep',
            amount: 84.5,
            title: 'Zakupy spożywcze',
            status: 'completed',
            created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
          },
          {
            id: 't-2',
            sender_account_id: 'acc-uuid-1',
            recipient_account_number: 'PL 88 1090 2222 9999 8888 7777',
            recipient_name: 'Przelew przychodzący',
            amount: 7200.0,
            title: 'Wynagrodzenie',
            status: 'completed',
            created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
          },
        ]);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  };

  const toggleBalancePrivacy = () => {
    Animated.parallel([
      Animated.timing(balanceOpacity, {
        toValue: 0.1,
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.timing(balanceScale, {
        toValue: 0.95,
        duration: 80,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setBalanceVisible((prev) => !prev);
      Animated.parallel([
        Animated.spring(balanceOpacity, {
          toValue: 1,
          damping: 14,
          stiffness: 180,
          useNativeDriver: true,
        }),
        Animated.spring(balanceScale, {
          toValue: 1,
          damping: 14,
          stiffness: 180,
          useNativeDriver: true,
        }),
      ]).start();
    });
  };

  const handleSignOut = () => {
    onLogout();
  };

  const handleTransferModal = () => {
    Alert.alert(
      'Nowy przelew',
      'Moduł autoryzacji zleceń zostanie zintegrowany w kolejnym etapie.'
    );
  };

  const getUserInitials = (): string => {
    if (profile?.first_name && profile?.last_name) {
      return `${profile.first_name[0]}${profile.last_name[0]}`.toUpperCase();
    }
    return userEmail.slice(0, 2).toUpperCase();
  };

  const formatCurrency = (val?: number, currency = 'PLN'): string => {
    if (val === undefined || val === null) return `0,00 ${currency}`;
    return `${val.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
  };

  const totalInflow = transactions
    .filter((t) => t.title.toLowerCase().includes('wynagrodzenie') || t.title.toLowerCase().includes('przychodzący'))
    .reduce((sum, t) => sum + t.amount, 0);

  const totalOutflow = transactions
    .filter((t) => !t.title.toLowerCase().includes('wynagrodzenie') && !t.title.toLowerCase().includes('przychodzący'))
    .reduce((sum, t) => sum + t.amount, 0);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        bounces={false}
        alwaysBounceVertical={false}
        overScrollMode="never"
      >
        <View style={styles.header}>
          <View style={styles.userInfoRow}>
            <View
              style={[
                styles.avatar,
                {
                  backgroundColor: theme.cardSecondary,
                  borderColor: theme.primary,
                },
              ]}
            >
              <Text style={[styles.avatarText, { color: theme.primary }]}>
                {getUserInitials()}
              </Text>
            </View>
            <View style={styles.nameBlock}>
              <Text style={[styles.welcomeText, { color: theme.textPrimary }]}>
                Witaj, {profile?.first_name || 'Użytkowniku'}
              </Text>
              <View
                style={[
                  styles.roleBadge,
                  { backgroundColor: theme.cardSecondary },
                ]}
              >
                <Text style={[styles.roleBadgeText, { color: theme.textSecondary }]}>
                  {profile?.role === 'admin' ? 'Administrator' : 'Konto osobiste'}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.headerControls}>
            <ThemeToggle />

            <TouchableOpacity
              style={[
                styles.logoutButton,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.cardBorder,
                },
              ]}
              onPress={handleSignOut}
              activeOpacity={0.7}
            >
              <Text style={[styles.logoutText, { color: theme.expense }]}>Wyloguj</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View
          style={[
            styles.cardWidget,
            {
              backgroundColor: theme.card,
              borderColor: theme.cardBorder,
              shadowColor: isDark ? '#000000' : '#64748B',
            },
          ]}
        >
          <View style={styles.cardHeader}>
            <Text style={[styles.cardLabel, { color: theme.textMuted }]}>Dostępne środki</Text>
            <TouchableOpacity
              onPress={toggleBalancePrivacy}
              style={styles.privacyToggle}
              activeOpacity={0.7}
            >
              <Text style={[styles.privacyToggleText, { color: theme.primary }]}>
                {balanceVisible ? 'Ukryj' : 'Pokaż'}
              </Text>
            </TouchableOpacity>
          </View>

          <Animated.View
            style={{
              opacity: balanceOpacity,
              transform: [{ scale: balanceScale }],
            }}
          >
            <Text style={[styles.balanceText, { color: theme.textPrimary }]}>
              {balanceVisible
                ? formatCurrency(account?.balance, account?.currency)
                : '•••••• PLN'}
            </Text>
          </Animated.View>

          <View
            style={[
              styles.accountNumberContainer,
              {
                backgroundColor: theme.cardSecondary,
                borderColor: theme.cardBorder,
              },
            ]}
          >
            <Text style={[styles.accountNumberLabel, { color: theme.textMuted }]}>
              Numer rachunku
            </Text>
            <Text style={[styles.accountNumberValue, { color: theme.textPrimary }]}>
              {account?.account_number}
            </Text>
          </View>

          <View
            style={[
              styles.summaryRow,
              {
                backgroundColor: theme.cardSecondary,
                borderColor: theme.cardBorder,
              },
            ]}
          >
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>Wpływy</Text>
              <Text style={[styles.summaryInflow, { color: theme.income }]}>
                +{formatCurrency(totalInflow, account?.currency)}
              </Text>
            </View>
            <View
              style={[styles.summaryDivider, { backgroundColor: theme.cardBorder }]}
            />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>Wydatki</Text>
              <Text style={[styles.summaryOutflow, { color: theme.textPrimary }]}>
                -{formatCurrency(totalOutflow, account?.currency)}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={[styles.primaryAction, { backgroundColor: theme.primary }]}
            onPress={handleTransferModal}
            activeOpacity={0.85}
          >
            <Text style={[styles.primaryActionText, { color: theme.primaryForeground }]}>
              Zleć przelew
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={fetchUserData} activeOpacity={0.8} style={styles.secondaryActionWrapper}>
            <View
              style={[
                styles.secondaryAction,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.cardBorder,
                },
              ]}
            >
              <Text style={[styles.secondaryActionText, { color: theme.textPrimary }]}>
                Odśwież
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        <SecuritySection userEmail={userEmail} onPinLocked={onPinLocked} />

        <View
          style={[
            styles.transactionsContainer,
            {
              backgroundColor: theme.card,
              borderColor: theme.cardBorder,
              shadowColor: isDark ? '#000000' : '#64748B',
            },
          ]}
        >
          <View style={styles.transactionsHeader}>
            <Text style={[styles.transactionsTitle, { color: theme.textPrimary }]}>
              Ostatnie transakcje
            </Text>
            <Text style={[styles.transactionsCount, { color: theme.textMuted }]}>
              {transactions.length} operacje
            </Text>
          </View>

          {loading ? (
            <ActivityIndicator color={theme.primary} style={styles.loader} />
          ) : transactions.length === 0 ? (
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>
              Brak zarejestrowanych transakcji.
            </Text>
          ) : (
            transactions.map((tx) => {
              const isIncome =
                tx.title.toLowerCase().includes('wynagrodzenie') ||
                tx.title.toLowerCase().includes('przychodzący');
              const initial = (tx.recipient_name || tx.title || 'T')[0].toUpperCase();

              return (
                <View
                  key={tx.id}
                  style={[styles.transactionRow, { borderBottomColor: theme.cardBorder }]}
                >
                  <View
                    style={[
                      styles.txAvatar,
                      {
                        backgroundColor: isIncome ? theme.incomeSoft : theme.cardSecondary,
                        borderColor: isIncome ? theme.income : theme.cardBorder,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.txAvatarText,
                        { color: isIncome ? theme.income : theme.textSecondary },
                      ]}
                    >
                      {initial}
                    </Text>
                  </View>
                  <View style={styles.txDetails}>
                    <Text
                      style={[styles.txTitle, { color: theme.textPrimary }]}
                      numberOfLines={1}
                    >
                      {tx.title}
                    </Text>
                    <Text
                      style={[styles.txSubtitle, { color: theme.textSecondary }]}
                      numberOfLines={1}
                    >
                      {tx.recipient_name}
                    </Text>
                    <Text style={[styles.txDate, { color: theme.textMuted }]}>
                      {new Date(tx.created_at).toLocaleDateString('pl-PL')}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.txAmount,
                      { color: isIncome ? theme.income : theme.textPrimary },
                    ]}
                  >
                    {isIncome ? '+' : '-'}
                    {formatCurrency(tx.amount, account?.currency)}
                  </Text>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 52,
    paddingBottom: 36,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  userInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
  },
  nameBlock: {
    justifyContent: 'center',
  },
  welcomeText: {
    fontSize: 17,
    fontWeight: '700',
  },
  roleBadge: {
    marginTop: 2,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  headerControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoutButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  logoutText: {
    fontSize: 12,
    fontWeight: '600',
  },
  cardWidget: {
    borderRadius: 22,
    padding: 22,
    borderWidth: 1,
    marginBottom: 18,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  privacyToggle: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  privacyToggleText: {
    fontSize: 12,
    fontWeight: '600',
  },
  balanceText: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 0.3,
    marginBottom: 16,
  },
  accountNumberContainer: {
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    marginBottom: 14,
  },
  accountNumberLabel: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  accountNumberValue: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
    letterSpacing: 0.3,
  },
  summaryRow: {
    flexDirection: 'row',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
  },
  summaryItem: {
    flex: 1,
  },
  summaryDivider: {
    width: 1,
    marginHorizontal: 12,
  },
  summaryLabel: {
    fontSize: 11,
    marginBottom: 3,
  },
  summaryInflow: {
    fontSize: 13,
    fontWeight: '700',
  },
  summaryOutflow: {
    fontSize: 13,
    fontWeight: '700',
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    gap: 10,
  },
  primaryAction: {
    flex: 0.64,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 3,
  },
  primaryActionText: {
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryActionWrapper: {
    flex: 0.36,
  },
  secondaryAction: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  secondaryActionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  transactionsContainer: {
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 3,
  },
  transactionsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  transactionsTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  transactionsCount: {
    fontSize: 12,
    fontWeight: '500',
  },
  loader: {
    marginVertical: 20,
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
    marginVertical: 16,
  },
  transactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  txAvatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  txAvatarText: {
    fontSize: 15,
    fontWeight: '700',
  },
  txDetails: {
    flex: 1,
    marginRight: 10,
  },
  txTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  txSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  txDate: {
    fontSize: 11,
    marginTop: 2,
  },
  txAmount: {
    fontSize: 14,
    fontWeight: '700',
  },
});
