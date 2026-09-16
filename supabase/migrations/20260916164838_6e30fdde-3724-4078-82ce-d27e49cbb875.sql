CREATE TABLE public.whatsapp_webhook_callbacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id text NOT NULL UNIQUE,
  provider_message_id text,
  phone_number text,
  event_type text NOT NULL,
  status text NOT NULL DEFAULT 'received',
  error_message text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.whatsapp_webhook_callbacks TO authenticated;
GRANT ALL ON public.whatsapp_webhook_callbacks TO service_role;

ALTER TABLE public.whatsapp_webhook_callbacks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view WhatsApp callback diagnostics"
ON public.whatsapp_webhook_callbacks
FOR SELECT
TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::public.app_role)
  OR private.has_role(auth.uid(), 'content_creator'::public.app_role)
);

CREATE INDEX whatsapp_webhook_callbacks_received_at_idx
ON public.whatsapp_webhook_callbacks (received_at DESC);

CREATE INDEX whatsapp_webhook_callbacks_status_idx
ON public.whatsapp_webhook_callbacks (status, received_at DESC);

CREATE TRIGGER update_whatsapp_webhook_callbacks_updated_at
BEFORE UPDATE ON public.whatsapp_webhook_callbacks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();