CREATE TABLE public.telegram_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id text NOT NULL UNIQUE,
  telegram_user_id text,
  username text,
  first_name text,
  last_name text,
  last_interaction_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.telegram_contacts TO authenticated;
GRANT ALL ON public.telegram_contacts TO service_role;
ALTER TABLE public.telegram_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view Telegram contacts" ON public.telegram_contacts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage Telegram contacts" ON public.telegram_contacts FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'content_creator')) WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'content_creator'));
CREATE TRIGGER update_telegram_contacts_updated_at BEFORE UPDATE ON public.telegram_contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.telegram_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id text NOT NULL REFERENCES public.telegram_contacts(chat_id) ON DELETE CASCADE,
  telegram_message_id text NOT NULL,
  update_id text,
  direction text NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
  content text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chat_id, telegram_message_id, direction)
);
GRANT SELECT ON public.telegram_messages TO authenticated;
GRANT INSERT ON public.telegram_messages TO authenticated;
GRANT ALL ON public.telegram_messages TO service_role;
ALTER TABLE public.telegram_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view Telegram messages" ON public.telegram_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can create Telegram messages" ON public.telegram_messages FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'content_creator'));
CREATE INDEX telegram_messages_chat_sent_idx ON public.telegram_messages(chat_id, sent_at DESC);
CREATE INDEX telegram_contacts_last_interaction_idx ON public.telegram_contacts(last_interaction_at DESC);
ALTER PUBLICATION supabase_realtime ADD TABLE public.telegram_messages;