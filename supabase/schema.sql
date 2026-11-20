CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    pesel VARCHAR(11) UNIQUE NOT NULL,
    client_number VARCHAR(10) UNIQUE,
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
    account_number VARCHAR(40) UNIQUE NOT NULL,
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

CREATE POLICY "profiles_insert_own" 
ON public.profiles FOR INSERT 
WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_admin" 
ON public.profiles FOR UPDATE 
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "accounts_select_own" 
ON public.accounts FOR SELECT 
USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "accounts_insert_own" 
ON public.accounts FOR INSERT 
WITH CHECK (auth.uid() = user_id);

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

CREATE OR REPLACE FUNCTION public.lookup_email_by_client_number(p_client_number TEXT)
RETURNS TEXT AS $$
DECLARE
    v_email TEXT;
BEGIN
    SELECT u.email INTO v_email
    FROM auth.users u
    JOIN public.profiles p ON p.id = u.id
    WHERE p.client_number = p_client_number
    LIMIT 1;
    RETURN v_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.lookup_email_by_client_number(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.build_nrb(bban TEXT)
RETURNS TEXT AS $$
DECLARE
    v_check TEXT;
    v_nrb TEXT;
BEGIN
    IF bban !~ '^\d{24}$' THEN
        RAISE EXCEPTION 'invalid_bban';
    END IF;
    v_check := LPAD((98 - ((bban || '252100')::NUMERIC % 97))::INT::TEXT, 2, '0');
    v_nrb := v_check || bban;
    RETURN 'PL ' || SUBSTR(v_nrb, 1, 2)
        || ' ' || SUBSTR(v_nrb, 3, 4) || ' ' || SUBSTR(v_nrb, 7, 4)
        || ' ' || SUBSTR(v_nrb, 11, 4) || ' ' || SUBSTR(v_nrb, 15, 4)
        || ' ' || SUBSTR(v_nrb, 19, 4) || ' ' || SUBSTR(v_nrb, 23, 4);
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = '';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_client_number VARCHAR(10);
    v_account_number VARCHAR(40);
BEGIN
    v_client_number := COALESCE(
        new.raw_user_meta_data->>'client_number',
        LPAD(FLOOR(10000000 + RANDOM() * 90000000)::TEXT, 8, '0')
    );
    v_account_number := COALESCE(
        new.raw_user_meta_data->>'account_number',
        public.build_nrb(
            '10500099'
            || LPAD(FLOOR(1000 + RANDOM() * 8999)::TEXT, 4, '0')
            || LPAD(FLOOR(1000 + RANDOM() * 8999)::TEXT, 4, '0')
            || LPAD(FLOOR(1000 + RANDOM() * 8999)::TEXT, 4, '0')
            || LPAD(FLOOR(1000 + RANDOM() * 8999)::TEXT, 4, '0')
        )
    );

    INSERT INTO public.profiles (id, first_name, last_name, pesel, client_number, role)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'first_name', 'Użytkownik'),
        COALESCE(new.raw_user_meta_data->>'last_name', 'SecureBank'),
        COALESCE(new.raw_user_meta_data->>'pesel', '00000000000'),
        v_client_number,
        'client'
    )
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.accounts (user_id, account_number, currency, balance, daily_limit)
    VALUES (
        new.id,
        v_account_number,
        'PLN',
        1000.00,
        5000.00
    )
    ON CONFLICT DO NOTHING;

    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

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

CREATE OR REPLACE FUNCTION public.set_daily_limit(new_limit NUMERIC)
RETURNS NUMERIC AS $$
DECLARE
    previous_limit NUMERIC;
BEGIN
    IF auth.uid() IS NULL OR NOT public.mfa_satisfied() THEN
        RAISE EXCEPTION 'not_authorized';
    END IF;
    IF new_limit IS NULL OR new_limit NOT IN (500, 1000, 2000, 5000, 10000, 20000, 50000) THEN
        RAISE EXCEPTION 'invalid_daily_limit';
    END IF;

    SELECT daily_limit INTO previous_limit
    FROM public.accounts
    WHERE user_id = auth.uid()
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'account_not_found';
    END IF;

    UPDATE public.accounts SET daily_limit = new_limit WHERE user_id = auth.uid();

    INSERT INTO public.audit_logs (user_id, action, details)
    VALUES (
        auth.uid(),
        'daily_limit_changed',
        jsonb_build_object('previous', previous_limit, 'current', new_limit)
    );

    RETURN new_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE ALL ON FUNCTION public.set_daily_limit(NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_daily_limit(NUMERIC) TO authenticated;

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS recipient_account_id UUID REFERENCES public.accounts(id);
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS sender_name VARCHAR(200);

DROP POLICY IF EXISTS "transactions_insert_own" ON public.transactions;
REVOKE INSERT, UPDATE, DELETE ON public.transactions FROM anon, authenticated;

DROP POLICY IF EXISTS "transactions_select_incoming" ON public.transactions;
CREATE POLICY "transactions_select_incoming"
ON public.transactions FOR SELECT
USING (
    recipient_account_id IN (
        SELECT id FROM public.accounts WHERE user_id = auth.uid()
    )
);

CREATE OR REPLACE FUNCTION public.execute_transfer(
    p_recipient_account TEXT,
    p_recipient_name TEXT,
    p_amount NUMERIC,
    p_title TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_digits TEXT;
    v_name TEXT;
    v_title TEXT;
    v_sender public.accounts;
    v_recipient public.accounts;
    v_sender_name TEXT;
    v_spent_today NUMERIC;
    v_transaction_id UUID;
BEGIN
    IF auth.uid() IS NULL OR NOT public.mfa_satisfied() THEN
        RAISE EXCEPTION 'not_authorized';
    END IF;

    v_name := LEFT(BTRIM(REGEXP_REPLACE(COALESCE(p_recipient_name, ''), '[[:cntrl:]]', '', 'g')), 200);
    v_title := LEFT(BTRIM(REGEXP_REPLACE(COALESCE(p_title, ''), '[[:cntrl:]]', '', 'g')), 255);
    IF v_name = '' OR v_title = '' THEN
        RAISE EXCEPTION 'missing_fields';
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 OR p_amount <> ROUND(p_amount, 2) OR p_amount > 9999999999999.99 THEN
        RAISE EXCEPTION 'invalid_amount';
    END IF;

    v_digits := REGEXP_REPLACE(UPPER(COALESCE(p_recipient_account, '')), '^PL|[^0-9]', '', 'g');
    IF v_digits !~ '^\d{26}$'
       OR (SUBSTR(v_digits, 3) || '2521' || SUBSTR(v_digits, 1, 2))::NUMERIC % 97 <> 1 THEN
        RAISE EXCEPTION 'invalid_account_number';
    END IF;

    SELECT * INTO v_sender FROM public.accounts WHERE user_id = auth.uid() LIMIT 1;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'account_not_found';
    END IF;

    SELECT * INTO v_recipient FROM public.accounts
    WHERE REGEXP_REPLACE(account_number, '[^0-9]', '', 'g') = v_digits
    LIMIT 1;

    IF v_recipient.id = v_sender.id THEN
        RAISE EXCEPTION 'same_account';
    END IF;

    PERFORM 1 FROM public.accounts
    WHERE id IN (v_sender.id, v_recipient.id)
    ORDER BY id
    FOR UPDATE;

    SELECT * INTO v_sender FROM public.accounts WHERE id = v_sender.id;

    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_blocked) THEN
        RAISE EXCEPTION 'account_blocked';
    END IF;

    SELECT COALESCE(SUM(amount), 0) INTO v_spent_today
    FROM public.transactions
    WHERE sender_account_id = v_sender.id
      AND status = 'completed'
      AND created_at >= (DATE_TRUNC('day', NOW() AT TIME ZONE 'Europe/Warsaw') AT TIME ZONE 'Europe/Warsaw');

    IF v_spent_today + p_amount > v_sender.daily_limit THEN
        RAISE EXCEPTION 'daily_limit_exceeded:%', GREATEST(v_sender.daily_limit - v_spent_today, 0);
    END IF;

    IF v_sender.balance < p_amount THEN
        RAISE EXCEPTION 'insufficient_funds';
    END IF;

    UPDATE public.accounts SET balance = balance - p_amount WHERE id = v_sender.id;
    IF v_recipient.id IS NOT NULL THEN
        UPDATE public.accounts SET balance = balance + p_amount WHERE id = v_recipient.id;
    END IF;

    SELECT TRIM(first_name || ' ' || last_name) INTO v_sender_name FROM public.profiles WHERE id = auth.uid();

    INSERT INTO public.transactions (
        sender_account_id, recipient_account_id, recipient_account_number,
        recipient_name, sender_name, amount, title, status
    )
    VALUES (
        v_sender.id, v_recipient.id, v_digits,
        v_name, v_sender_name, p_amount, v_title, 'completed'
    )
    RETURNING id INTO v_transaction_id;

    INSERT INTO public.audit_logs (user_id, action, details)
    VALUES (
        auth.uid(),
        'transfer_executed',
        jsonb_build_object('transaction_id', v_transaction_id, 'amount', p_amount, 'internal', v_recipient.id IS NOT NULL)
    );

    RETURN jsonb_build_object(
        'transaction_id', v_transaction_id,
        'balance', v_sender.balance - p_amount,
        'internal', v_recipient.id IS NOT NULL
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE ALL ON FUNCTION public.execute_transfer(TEXT, TEXT, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.execute_transfer(TEXT, TEXT, NUMERIC, TEXT) TO authenticated;
