export type UserRole = 'client' | 'admin';

export interface UserProfile {
  id: string;
  first_name: string;
  last_name: string;
  pesel: string;
  role: UserRole;
  is_blocked: boolean;
  two_factor_enabled: boolean;
  created_at: string;
}

export interface BankAccount {
  id: string;
  user_id: string;
  account_number: string;
  currency: string;
  balance: number;
  daily_limit: number;
  created_at: string;
}

export interface Transaction {
  id: string;
  sender_account_id: string;
  recipient_account_number: string;
  recipient_name: string;
  amount: number;
  title: string;
  status: 'pending' | 'completed' | 'flagged' | 'rejected';
  created_at: string;
}

export interface BackendConnectionStatus {
  connected: boolean;
  url: string;
  error?: string;
}
