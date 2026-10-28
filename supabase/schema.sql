CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    pesel VARCHAR(11) UNIQUE NOT NULL,
    role VARCHAR(20) DEFAULT 'client' CHECK (role IN ('client', 'admin')),
    is_blocked BOOLEAN DEFAULT false,
    two_factor_enabled BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    account_number VARCHAR(26) UNIQUE NOT NULL,
    currency VARCHAR(3) DEFAULT 'PLN',
    balance DECIMAL(15, 2) DEFAULT 0.00 CHECK (balance >= 0.00),
    daily_limit DECIMAL(15, 2) DEFAULT 5000.00 CHECK (daily_limit >= 0.00),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sender_account_id UUID REFERENCES public.accounts(id),
    recipient_account_number VARCHAR(26) NOT NULL,
    recipient_name VARCHAR(200) NOT NULL,
    amount DECIMAL(15, 2) NOT NULL CHECK (amount > 0.00),
    title VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'flagged', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id),
    action VARCHAR(100) NOT NULL,
    details JSONB,
    ip_address INET,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE POLICY "profiles_select_own" 
ON public.profiles FOR SELECT 
USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "profiles_update_admin" 
ON public.profiles FOR UPDATE 
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "accounts_select_own" 
ON public.accounts FOR SELECT 
USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "transactions_select_own" 
ON public.transactions FOR SELECT 
USING (
    sender_account_id IN (
        SELECT id FROM public.accounts WHERE user_id = auth.uid()
    ) OR public.is_admin()
);

CREATE POLICY "transactions_insert_own" 
ON public.transactions FOR INSERT 
WITH CHECK (
    sender_account_id IN (
        SELECT id FROM public.accounts WHERE user_id = auth.uid()
    )
);

CREATE POLICY "audit_logs_insert_all" 
ON public.audit_logs FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "audit_logs_select_admin" 
ON public.audit_logs FOR SELECT 
USING (public.is_admin());
