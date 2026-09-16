CREATE TABLE public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
  template_name text,
  content text NOT NULL,
  provider_message_id text,
  status text NOT NULL DEFAULT 'sent',
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_message_id)
);
GRANT SELECT ON public.whatsapp_messages TO authenticated;
GRANT INSERT, UPDATE ON public.whatsapp_messages TO authenticated;
GRANT ALL ON public.whatsapp_messages TO service_role;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view WhatsApp history" ON public.whatsapp_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can create WhatsApp history" ON public.whatsapp_messages FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'content_creator'));
CREATE POLICY "Staff can update WhatsApp history" ON public.whatsapp_messages FOR UPDATE TO authenticated USING (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'content_creator')) WITH CHECK (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'content_creator'));
CREATE INDEX whatsapp_messages_phone_sent_idx ON public.whatsapp_messages (phone_number, sent_at DESC);
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;