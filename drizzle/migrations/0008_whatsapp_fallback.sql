-- WhatsApp fallback replies: inbound messages that match no course step get a help menu, and the chat is
-- flagged for staff. Every automated reply is claimed per provider message ID so webhook retries never resend.

-- Staff flag and fallback cooldown on the contact. Written only by trusted server code.
ALTER TABLE public.whatsapp_contacts
  ADD COLUMN IF NOT EXISTS needs_attention boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS attention_reason text,
  ADD COLUMN IF NOT EXISTS attention_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_fallback_at timestamptz;
CREATE INDEX IF NOT EXISTS whatsapp_contacts_needs_attention_idx
  ON public.whatsapp_contacts (attention_at) WHERE needs_attention;

-- Legacy admin contact sync may still write the WATI columns; the flag and cooldown are server-only.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.whatsapp_contacts FROM anon, authenticated;
GRANT SELECT, DELETE ON public.whatsapp_contacts TO authenticated;
GRANT INSERT (wati_id, phone_number, name) ON public.whatsapp_contacts TO authenticated;
GRANT UPDATE (wati_id, phone_number, name, updated_at) ON public.whatsapp_contacts TO authenticated;
GRANT ALL ON public.whatsapp_contacts TO service_role;

-- Flagging or resolving a chat must not move its "last active" time.
DROP TRIGGER IF EXISTS update_whatsapp_contacts_updated_at ON public.whatsapp_contacts;
CREATE TRIGGER update_whatsapp_contacts_updated_at
  BEFORE UPDATE ON public.whatsapp_contacts
  FOR EACH ROW
  WHEN ((OLD.wati_id, OLD.phone_number, OLD.name, OLD.updated_at)
    IS DISTINCT FROM (NEW.wati_id, NEW.phone_number, NEW.name, NEW.updated_at))
  EXECUTE FUNCTION public.update_updated_at_column();

-- Single-row bot settings. Active staff read them; changes go through an authenticated server function.
CREATE TABLE IF NOT EXISTS public.whatsapp_bot_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  fallback_enabled boolean NOT NULL DEFAULT true,
  fallback_message text NOT NULL DEFAULT 'Hi! I couldn''t match your message to a lesson. What would you like to do?'
    CHECK (char_length(btrim(fallback_message)) BETWEEN 1 AND 1000),
  cooldown_minutes integer NOT NULL DEFAULT 60 CHECK (cooldown_minutes BETWEEN 0 AND 1440),
  handoff_message text NOT NULL DEFAULT 'Thanks! Someone from the Ekatra team will reply here soon.'
    CHECK (char_length(btrim(handoff_message)) BETWEEN 1 AND 1000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
INSERT INTO public.whatsapp_bot_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.whatsapp_bot_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_bot_settings FROM anon, authenticated;
GRANT SELECT ON public.whatsapp_bot_settings TO authenticated;
GRANT ALL ON public.whatsapp_bot_settings TO service_role;
DROP POLICY IF EXISTS "Active staff can view WhatsApp bot settings" ON public.whatsapp_bot_settings;
CREATE POLICY "Active staff can view WhatsApp bot settings" ON public.whatsapp_bot_settings FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'content_creator'));

-- Outbox for automated replies outside course progression (fallback menu, My courses, Talk to a person).
-- delivered_count lets a retry resume after the last message WhatsApp accepted.
CREATE TABLE IF NOT EXISTS public.whatsapp_auto_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_message_id text NOT NULL UNIQUE,
  phone_number text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('fallback', 'courses', 'human')),
  will_reply boolean NOT NULL,
  response_messages jsonb,
  delivered_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS whatsapp_auto_replies_phone_idx ON public.whatsapp_auto_replies (phone_number, created_at DESC);
ALTER TABLE public.whatsapp_auto_replies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_auto_replies FROM anon, authenticated;
GRANT SELECT ON public.whatsapp_auto_replies TO authenticated;
GRANT ALL ON public.whatsapp_auto_replies TO service_role;
DROP POLICY IF EXISTS "Active staff can view WhatsApp auto replies" ON public.whatsapp_auto_replies;
CREATE POLICY "Active staff can view WhatsApp auto replies" ON public.whatsapp_auto_replies FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'content_creator'));

-- Claims an automated reply for one inbound message. Atomically: returns the existing claim on a retry;
-- otherwise applies the fallback cooldown per phone, flags the chat for staff when p_flag_reason is set,
-- and stores the messages to send. The returned row has claimed = false when it already existed.
CREATE OR REPLACE FUNCTION public.claim_whatsapp_auto_reply(
  p_provider_message_id text,
  p_phone text,
  p_kind text,
  p_messages jsonb,
  p_cooldown_minutes integer,
  p_flag_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_row public.whatsapp_auto_replies;
  v_last_fallback timestamptz;
  v_will_reply boolean;
BEGIN
  -- Serialize claims per phone so the cooldown holds under concurrent callbacks.
  INSERT INTO public.whatsapp_contacts (phone_number) VALUES (p_phone) ON CONFLICT (phone_number) DO NOTHING;
  SELECT last_fallback_at INTO v_last_fallback FROM public.whatsapp_contacts WHERE phone_number = p_phone FOR UPDATE;

  SELECT * INTO v_row FROM public.whatsapp_auto_replies WHERE provider_message_id = p_provider_message_id;
  IF FOUND THEN
    RETURN to_jsonb(v_row) || jsonb_build_object('claimed', false);
  END IF;

  v_will_reply := p_messages IS NOT NULL AND jsonb_array_length(p_messages) > 0 AND (
    p_kind <> 'fallback' OR v_last_fallback IS NULL
    OR v_last_fallback <= now() - make_interval(mins => GREATEST(COALESCE(p_cooldown_minutes, 0), 0))
  );

  INSERT INTO public.whatsapp_auto_replies (provider_message_id, phone_number, kind, will_reply, response_messages, status, completed_at)
  VALUES (p_provider_message_id, p_phone, p_kind, v_will_reply,
    CASE WHEN v_will_reply THEN p_messages END,
    CASE WHEN v_will_reply THEN 'pending' ELSE 'completed' END,
    CASE WHEN v_will_reply THEN NULL ELSE now() END)
  RETURNING * INTO v_row;

  UPDATE public.whatsapp_contacts SET
    last_fallback_at = CASE WHEN p_kind = 'fallback' AND v_will_reply THEN now() ELSE last_fallback_at END,
    needs_attention = needs_attention OR p_flag_reason IS NOT NULL,
    attention_reason = COALESCE(p_flag_reason, attention_reason),
    -- Keep when the chat first needed attention; a new flag on a resolved chat starts a new wait.
    attention_at = CASE WHEN p_flag_reason IS NULL THEN attention_at
      WHEN needs_attention THEN COALESCE(attention_at, now()) ELSE now() END
  WHERE phone_number = p_phone;

  RETURN to_jsonb(v_row) || jsonb_build_object('claimed', true);
END;
$$;
REVOKE ALL ON FUNCTION public.claim_whatsapp_auto_reply(text, text, text, jsonb, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_whatsapp_auto_reply(text, text, text, jsonb, integer, text) TO service_role;

COMMENT ON COLUMN public.whatsapp_contacts.needs_attention IS 'Set by trusted server code when a learner needs a person; cleared by an active staff resolve or staff reply.';
