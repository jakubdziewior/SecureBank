CREATE OR REPLACE FUNCTION public.session_active()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM auth.sessions s
        WHERE s.id = NULLIF(auth.jwt()->>'session_id', '')::UUID
          AND s.user_id = auth.uid()
          AND (s.not_after IS NULL OR s.not_after > now())
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION public.mfa_satisfied()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN public.session_active() AND (
        COALESCE(auth.jwt()->>'aal', 'aal1') = 'aal2' OR NOT EXISTS (
            SELECT 1 FROM auth.mfa_factors
            WHERE user_id = auth.uid() AND status = 'verified'
        )
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '';

REVOKE ALL ON FUNCTION public.session_active() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.session_active() TO authenticated;

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "accounts_insert_own" ON public.accounts;
REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.accounts FROM anon, authenticated;

DROP FUNCTION IF EXISTS public.lookup_email_by_client_number(TEXT);

CREATE TABLE IF NOT EXISTS public.login_attempts (
    identifier TEXT PRIMARY KEY,
    failed_count INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.login_attempts FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.resolve_login(p_login TEXT, p_password TEXT)
RETURNS JSONB AS $$
DECLARE
    v_identifier TEXT;
    v_attempt public.login_attempts;
    v_email TEXT;
    v_hash TEXT;
    v_valid BOOLEAN := false;
BEGIN
    v_identifier := LOWER(BTRIM(COALESCE(p_login, '')));
    IF v_identifier = '' OR LENGTH(v_identifier) > 254 OR COALESCE(p_password, '') = '' THEN
        RETURN jsonb_build_object('status', 'invalid');
    END IF;

    INSERT INTO public.login_attempts (identifier) VALUES (v_identifier)
    ON CONFLICT (identifier) DO NOTHING;

    SELECT * INTO v_attempt FROM public.login_attempts
    WHERE identifier = v_identifier
    FOR UPDATE;

    IF v_attempt.locked_until IS NOT NULL AND v_attempt.locked_until > now() THEN
        RETURN jsonb_build_object(
            'status', 'locked',
            'retry_after', CEIL(EXTRACT(EPOCH FROM v_attempt.locked_until - now()))::INT
        );
    END IF;

    IF POSITION('@' IN v_identifier) > 0 THEN
        SELECT u.email, u.encrypted_password INTO v_email, v_hash
        FROM auth.users u
        WHERE LOWER(u.email) = v_identifier
        LIMIT 1;
    ELSE
        SELECT u.email, u.encrypted_password INTO v_email, v_hash
        FROM auth.users u
        JOIN public.profiles p ON p.id = u.id
        WHERE p.client_number = v_identifier
        LIMIT 1;
    END IF;

    IF v_hash IS NOT NULL AND v_hash <> '' THEN
        v_valid := v_hash = extensions.crypt(p_password, v_hash);
    ELSE
        PERFORM extensions.crypt(p_password, extensions.gen_salt('bf', 10));
    END IF;

    IF v_valid THEN
        UPDATE public.login_attempts
        SET failed_count = 0, locked_until = NULL, updated_at = now()
        WHERE identifier = v_identifier;
        RETURN jsonb_build_object('status', 'ok', 'email', v_email);
    END IF;

    IF v_attempt.failed_count + 1 >= 5 THEN
        UPDATE public.login_attempts
        SET failed_count = 0, locked_until = now() + INTERVAL '15 minutes', updated_at = now()
        WHERE identifier = v_identifier;
        RETURN jsonb_build_object('status', 'locked', 'retry_after', 900);
    END IF;

    UPDATE public.login_attempts
    SET failed_count = failed_count + 1, updated_at = now()
    WHERE identifier = v_identifier;
    RETURN jsonb_build_object('status', 'invalid', 'attempts_left', 5 - (v_attempt.failed_count + 1));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE ALL ON FUNCTION public.resolve_login(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_login(TEXT, TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.my_sessions()
RETURNS JSONB AS $$
BEGIN
    IF auth.uid() IS NULL OR NOT public.mfa_satisfied() THEN
        RAISE EXCEPTION 'not_authorized';
    END IF;
    RETURN COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
            'id', s.id,
            'created_at', s.created_at,
            'last_active', COALESCE(s.refreshed_at, s.updated_at, s.created_at),
            'user_agent', s.user_agent,
            'aal', s.aal,
            'current', s.id = NULLIF(auth.jwt()->>'session_id', '')::UUID
        ) ORDER BY COALESCE(s.refreshed_at, s.updated_at, s.created_at) DESC)
        FROM auth.sessions s
        WHERE s.user_id = auth.uid()
          AND (s.not_after IS NULL OR s.not_after > now())
    ), '[]'::JSONB);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '';

REVOKE ALL ON FUNCTION public.my_sessions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_sessions() TO authenticated;

DROP FUNCTION IF EXISTS public.set_daily_limit(NUMERIC);

CREATE OR REPLACE FUNCTION public.set_daily_limit(new_limit NUMERIC, p_pin TEXT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
    previous_limit NUMERIC;
    pin_result JSONB;
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
    ORDER BY created_at
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'account_not_found';
    END IF;

    IF new_limit > previous_limit THEN
        IF p_pin IS NULL THEN
            RETURN jsonb_build_object('status', 'pin_required');
        END IF;
        pin_result := public.verify_pin(p_pin);
        IF NOT (pin_result->>'valid')::BOOLEAN THEN
            RETURN jsonb_build_object(
                'status', 'pin_invalid',
                'attempts_left', COALESCE((pin_result->>'attempts_left')::INT, 0),
                'reset', COALESCE((pin_result->>'reset')::BOOLEAN, false)
            );
        END IF;
    END IF;

    UPDATE public.accounts SET daily_limit = new_limit WHERE user_id = auth.uid();

    INSERT INTO public.audit_logs (user_id, action, details)
    VALUES (
        auth.uid(),
        'daily_limit_changed',
        jsonb_build_object('previous', previous_limit, 'current', new_limit, 'pin_confirmed', new_limit > previous_limit)
    );

    RETURN jsonb_build_object('status', 'ok', 'limit', new_limit);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE ALL ON FUNCTION public.set_daily_limit(NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_daily_limit(NUMERIC, TEXT) TO authenticated;

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS request_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS transactions_sender_request_id_key
    ON public.transactions (sender_account_id, request_id);

DROP FUNCTION IF EXISTS public.execute_transfer(TEXT, TEXT, NUMERIC, TEXT);

CREATE OR REPLACE FUNCTION public.execute_transfer(
    p_recipient_account TEXT,
    p_recipient_name TEXT,
    p_amount NUMERIC,
    p_title TEXT,
    p_pin TEXT,
    p_request_id UUID
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
    v_existing public.transactions;
    pin_result JSONB;
BEGIN
    IF auth.uid() IS NULL OR NOT public.mfa_satisfied() THEN
        RAISE EXCEPTION 'not_authorized';
    END IF;
    IF p_request_id IS NULL THEN
        RAISE EXCEPTION 'missing_request_id';
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

    SELECT * INTO v_sender FROM public.accounts
    WHERE user_id = auth.uid()
    ORDER BY created_at
    LIMIT 1;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'account_not_found';
    END IF;

    SELECT * INTO v_existing FROM public.transactions
    WHERE sender_account_id = v_sender.id AND request_id = p_request_id;
    IF FOUND THEN
        RETURN jsonb_build_object(
            'status', 'ok',
            'duplicate', true,
            'transaction_id', v_existing.id,
            'balance', v_sender.balance,
            'internal', v_existing.recipient_account_id IS NOT NULL
        );
    END IF;

    pin_result := public.verify_pin(p_pin);
    IF NOT (pin_result->>'valid')::BOOLEAN THEN
        RETURN jsonb_build_object(
            'status', 'pin_invalid',
            'attempts_left', COALESCE((pin_result->>'attempts_left')::INT, 0),
            'reset', COALESCE((pin_result->>'reset')::BOOLEAN, false)
        );
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
        recipient_name, sender_name, amount, title, status, request_id
    )
    VALUES (
        v_sender.id, v_recipient.id, v_digits,
        v_name, v_sender_name, p_amount, v_title, 'completed', p_request_id
    )
    RETURNING id INTO v_transaction_id;

    INSERT INTO public.audit_logs (user_id, action, details)
    VALUES (
        auth.uid(),
        'transfer_executed',
        jsonb_build_object(
            'transaction_id', v_transaction_id,
            'amount', p_amount,
            'internal', v_recipient.id IS NOT NULL,
            'session_id', auth.jwt()->>'session_id'
        )
    );

    RETURN jsonb_build_object(
        'status', 'ok',
        'duplicate', false,
        'transaction_id', v_transaction_id,
        'balance', v_sender.balance - p_amount,
        'internal', v_recipient.id IS NOT NULL
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE ALL ON FUNCTION public.execute_transfer(TEXT, TEXT, NUMERIC, TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.execute_transfer(TEXT, TEXT, NUMERIC, TEXT, TEXT, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
