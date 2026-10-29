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

CREATE OR REPLACE FUNCTION public.mfa_satisfied()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN COALESCE(auth.jwt()->>'aal', 'aal1') = 'aal2' OR NOT EXISTS (
        SELECT 1 FROM auth.mfa_factors
        WHERE user_id = auth.uid() AND status = 'verified'
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '';

CREATE POLICY "profiles_require_mfa"
ON public.profiles AS RESTRICTIVE FOR ALL TO authenticated
USING (public.mfa_satisfied())
WITH CHECK (public.mfa_satisfied());

CREATE POLICY "accounts_require_mfa"
ON public.accounts AS RESTRICTIVE FOR ALL TO authenticated
USING (public.mfa_satisfied())
WITH CHECK (public.mfa_satisfied());

CREATE POLICY "transactions_require_mfa"
ON public.transactions AS RESTRICTIVE FOR ALL TO authenticated
USING (public.mfa_satisfied())
WITH CHECK (public.mfa_satisfied());

CREATE POLICY "audit_logs_require_mfa"
ON public.audit_logs AS RESTRICTIVE FOR ALL TO authenticated
USING (public.mfa_satisfied())
WITH CHECK (public.mfa_satisfied());

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.user_pins (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    pin_hash TEXT NOT NULL,
    failed_attempts INT NOT NULL DEFAULT 0,
    version INT NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_pins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_pins FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.recent_password_login(max_age_seconds INT DEFAULT 900)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(auth.jwt()->'amr', '[]'::jsonb)) AS a
        WHERE a->>'method' = 'password'
          AND (a->>'timestamp')::BIGINT > EXTRACT(EPOCH FROM now()) - max_age_seconds
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION public.pin_status()
RETURNS JSONB AS $$
DECLARE
    pin_row public.user_pins;
BEGIN
    IF auth.uid() IS NULL OR NOT public.mfa_satisfied() THEN
        RAISE EXCEPTION 'not_authorized';
    END IF;
    SELECT * INTO pin_row FROM public.user_pins WHERE user_id = auth.uid();
    RETURN jsonb_build_object('has_pin', pin_row.user_id IS NOT NULL, 'version', pin_row.version);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION public.verify_pin(pin TEXT)
RETURNS JSONB AS $$
DECLARE
    pin_row public.user_pins;
BEGIN
    IF auth.uid() IS NULL OR NOT public.mfa_satisfied() THEN
        RAISE EXCEPTION 'not_authorized';
    END IF;
    SELECT * INTO pin_row FROM public.user_pins WHERE user_id = auth.uid() FOR UPDATE;
    IF pin_row.user_id IS NULL THEN
        RETURN jsonb_build_object('valid', false, 'attempts_left', 0, 'reset', true);
    END IF;
    IF pin_row.pin_hash = extensions.crypt(pin, pin_row.pin_hash) THEN
        UPDATE public.user_pins SET failed_attempts = 0 WHERE user_id = auth.uid();
        RETURN jsonb_build_object('valid', true, 'version', pin_row.version);
    END IF;
    IF pin_row.failed_attempts + 1 >= 5 THEN
        DELETE FROM public.user_pins WHERE user_id = auth.uid();
        RETURN jsonb_build_object('valid', false, 'attempts_left', 0, 'reset', true);
    END IF;
    UPDATE public.user_pins SET failed_attempts = failed_attempts + 1 WHERE user_id = auth.uid();
    RETURN jsonb_build_object('valid', false, 'attempts_left', 5 - (pin_row.failed_attempts + 1), 'reset', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION public.set_pin(new_pin TEXT, current_pin TEXT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
    pin_row public.user_pins;
    check_result JSONB;
BEGIN
    IF auth.uid() IS NULL OR NOT public.mfa_satisfied() THEN
        RAISE EXCEPTION 'not_authorized';
    END IF;
    IF new_pin !~ '^\d{6}$' THEN
        RAISE EXCEPTION 'invalid_pin_format';
    END IF;

    SELECT * INTO pin_row FROM public.user_pins WHERE user_id = auth.uid();

    IF current_pin IS NOT NULL AND pin_row.user_id IS NOT NULL THEN
        check_result := public.verify_pin(current_pin);
        IF NOT (check_result->>'valid')::BOOLEAN THEN
            RETURN check_result;
        END IF;
    ELSIF NOT public.recent_password_login() THEN
        RAISE EXCEPTION 'recent_login_required';
    END IF;

    INSERT INTO public.user_pins (user_id, pin_hash, failed_attempts, version, updated_at)
    VALUES (auth.uid(), extensions.crypt(new_pin, extensions.gen_salt('bf', 10)), 0, 1, now())
    ON CONFLICT (user_id) DO UPDATE
    SET pin_hash = EXCLUDED.pin_hash,
        failed_attempts = 0,
        version = public.user_pins.version + 1,
        updated_at = now();

    SELECT * INTO pin_row FROM public.user_pins WHERE user_id = auth.uid();
    RETURN jsonb_build_object('valid', true, 'version', pin_row.version);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE ALL ON FUNCTION public.pin_status() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.verify_pin(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_pin(TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.recent_password_login(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pin_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_pin(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_pin(TEXT, TEXT) TO authenticated;
