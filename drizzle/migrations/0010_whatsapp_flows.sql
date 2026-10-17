-- Staff-built WhatsApp flows (keyword, fallback, before/after a course, broadcasts). Rules live in
-- src/lib/flow-engine.ts; these tables hold drafts, immutable published versions, sessions and the outbox.
-- Active staff read everything; all writes go through trusted server code (service role) and the RPCs below.

CREATE TABLE public.whatsapp_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  kind text NOT NULL CHECK (kind IN ('keyword', 'fallback', 'course_start', 'course_complete', 'broadcast')),
  -- Staff-edited keywords; whatsapp_flow_keywords holds the ones in effect while the flow is active.
  keywords text[] NOT NULL DEFAULT '{}',
  course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT false,
  draft_graph jsonb NOT NULL DEFAULT '{"nodes": [], "edges": []}'::jsonb,
  published_version integer,
  audience jsonb,
  scheduled_at timestamptz,
  fallback_cooldown_minutes integer NOT NULL DEFAULT 60 CHECK (fallback_cooldown_minutes BETWEEN 0 AND 10080),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind IN ('course_start', 'course_complete')) = (course_id IS NOT NULL)),
  CHECK (NOT is_active OR published_version IS NOT NULL)
);
-- At most one active fallback, and one active before/after flow per course.
CREATE UNIQUE INDEX whatsapp_flows_one_active_fallback ON public.whatsapp_flows (kind) WHERE kind = 'fallback' AND is_active;
CREATE UNIQUE INDEX whatsapp_flows_one_active_per_course ON public.whatsapp_flows (kind, course_id)
  WHERE kind IN ('course_start', 'course_complete') AND is_active;
CREATE TRIGGER update_whatsapp_flows_updated_at BEFORE UPDATE ON public.whatsapp_flows
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Published graphs never change, so a running session keeps the version it started on.
CREATE TABLE public.whatsapp_flow_versions (
  flow_id uuid NOT NULL REFERENCES public.whatsapp_flows(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  graph jsonb NOT NULL,
  published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (flow_id, version)
);
ALTER TABLE public.whatsapp_flows ADD CONSTRAINT whatsapp_flows_published_version_fkey
  FOREIGN KEY (id, published_version) REFERENCES public.whatsapp_flow_versions (flow_id, version) DEFERRABLE INITIALLY DEFERRED;

-- Keywords of active keyword flows; the primary key makes a keyword start at most one flow.
CREATE TABLE public.whatsapp_flow_keywords (
  keyword text PRIMARY KEY CHECK (keyword = lower(btrim(keyword)) AND length(keyword) BETWEEN 1 AND 32),
  flow_id uuid NOT NULL REFERENCES public.whatsapp_flows(id) ON DELETE CASCADE
);
CREATE INDEX whatsapp_flow_keywords_flow_idx ON public.whatsapp_flow_keywords (flow_id);

CREATE TABLE public.whatsapp_flow_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number text NOT NULL CHECK (phone_number ~ '^[1-9][0-9]{6,14}$'),
  flow_id uuid NOT NULL,
  flow_version integer NOT NULL,
  current_node_id text,
  variables jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(variables) = 'object'),
  status text NOT NULL CHECK (status IN ('waiting_reply', 'waiting_delay', 'completed', 'expired', 'handed_off')),
  wait_until timestamptz,
  enrollment_id uuid REFERENCES public.whatsapp_course_enrollments(id) ON DELETE SET NULL,
  is_test boolean NOT NULL DEFAULT false,
  state_version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (flow_id, flow_version) REFERENCES public.whatsapp_flow_versions (flow_id, version) ON DELETE CASCADE,
  CHECK ((status = 'waiting_delay') = (wait_until IS NOT NULL))
);
-- One open session per phone; a handed-off session keeps flows quiet until staff resolve it.
CREATE UNIQUE INDEX whatsapp_flow_sessions_one_open ON public.whatsapp_flow_sessions (phone_number)
  WHERE status IN ('waiting_reply', 'waiting_delay', 'handed_off');
CREATE INDEX whatsapp_flow_sessions_due_idx ON public.whatsapp_flow_sessions (wait_until) WHERE status = 'waiting_delay';
CREATE INDEX whatsapp_flow_sessions_waiting_idx ON public.whatsapp_flow_sessions (updated_at)
  WHERE status IN ('waiting_reply', 'handed_off');
CREATE INDEX whatsapp_flow_sessions_flow_idx ON public.whatsapp_flow_sessions (flow_id, created_at DESC);
CREATE TRIGGER update_whatsapp_flow_sessions_updated_at BEFORE UPDATE ON public.whatsapp_flow_sessions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Outbox, same pattern as whatsapp_progression_events: the key (provider message ID or
-- flow:<kind>:<session>:<version>) is claimed first, messages are stored with the step, and
-- delivery resumes from delivered_count.
CREATE TABLE public.whatsapp_flow_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  phone_number text NOT NULL,
  session_id uuid REFERENCES public.whatsapp_flow_sessions(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  outcome text,
  response_messages jsonb,
  response_text text,
  delivered_count integer NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX whatsapp_flow_events_pending_idx ON public.whatsapp_flow_events (created_at) WHERE status = 'pending';
CREATE INDEX whatsapp_flow_events_session_idx ON public.whatsapp_flow_events (session_id, created_at DESC);

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['whatsapp_flows', 'whatsapp_flow_versions', 'whatsapp_flow_keywords', 'whatsapp_flow_sessions', 'whatsapp_flow_events'] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY "Active staff can view WhatsApp flows" ON public.%I FOR SELECT TO authenticated USING (private.has_role(auth.uid(), ''admin'') OR private.has_role(auth.uid(), ''content_creator''))',
      t
    );
  END LOOP;
END $$;

-- Publishes a validated graph as the next version and, for an active keyword flow, swaps its keywords.
-- Raises flow_keyword_taken (23505) when another active flow already uses a keyword.
CREATE OR REPLACE FUNCTION public.publish_whatsapp_flow(
  p_flow_id uuid,
  p_graph jsonb,
  p_keywords text[],
  p_user_id uuid
) RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_flow public.whatsapp_flows%ROWTYPE;
  v_version integer;
BEGIN
  SELECT * INTO v_flow FROM public.whatsapp_flows WHERE id = p_flow_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'flow_not_found' USING ERRCODE = 'P0002';
  END IF;
  SELECT COALESCE(MAX(version), 0) + 1 INTO v_version FROM public.whatsapp_flow_versions WHERE flow_id = p_flow_id;
  INSERT INTO public.whatsapp_flow_versions (flow_id, version, graph, published_by) VALUES (p_flow_id, v_version, p_graph, p_user_id);
  UPDATE public.whatsapp_flows
  SET published_version = v_version, draft_graph = p_graph, keywords = COALESCE(p_keywords, '{}'), updated_by = p_user_id
  WHERE id = p_flow_id;
  IF v_flow.is_active AND v_flow.kind = 'keyword' THEN
    PERFORM private.sync_whatsapp_flow_keywords(p_flow_id, COALESCE(p_keywords, '{}'));
  END IF;
  RETURN v_version;
END;
$$;

-- Turns a published flow on or off. Keyword rows follow the active state; the partial unique indexes
-- refuse a second active fallback or before/after flow for the same course.
CREATE OR REPLACE FUNCTION public.set_whatsapp_flow_active(
  p_flow_id uuid,
  p_active boolean,
  p_user_id uuid
) RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_flow public.whatsapp_flows%ROWTYPE;
BEGIN
  SELECT * INTO v_flow FROM public.whatsapp_flows WHERE id = p_flow_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'flow_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF p_active AND v_flow.published_version IS NULL THEN
    RAISE EXCEPTION 'flow_not_published' USING ERRCODE = '22023';
  END IF;
  IF p_active AND v_flow.kind = 'keyword' AND cardinality(v_flow.keywords) = 0 THEN
    RAISE EXCEPTION 'flow_needs_keywords' USING ERRCODE = '22023';
  END IF;
  UPDATE public.whatsapp_flows SET is_active = p_active, updated_by = p_user_id WHERE id = p_flow_id;
  IF p_active AND v_flow.kind = 'keyword' THEN
    PERFORM private.sync_whatsapp_flow_keywords(p_flow_id, v_flow.keywords);
  ELSE
    DELETE FROM public.whatsapp_flow_keywords WHERE flow_id = p_flow_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.sync_whatsapp_flow_keywords(p_flow_id uuid, p_keywords text[])
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_taken text;
BEGIN
  DELETE FROM public.whatsapp_flow_keywords WHERE flow_id = p_flow_id;
  SELECT k.keyword INTO v_taken FROM public.whatsapp_flow_keywords k WHERE k.keyword = ANY (p_keywords) LIMIT 1;
  IF v_taken IS NOT NULL THEN
    RAISE EXCEPTION 'flow_keyword_taken' USING ERRCODE = '23505', DETAIL = v_taken;
  END IF;
  INSERT INTO public.whatsapp_flow_keywords (keyword, flow_id) SELECT DISTINCT unnest(p_keywords), p_flow_id;
END;
$$;

-- Applies one flow step atomically: version check (or a new session), new state and outbox messages.
-- p_session_id NULL starts a session from p_new_session {phone_number, flow_id, flow_version, is_test,
-- enrollment_id}; a start supersedes the phone's waiting sessions and a handoff older than 24 hours,
-- but never a current handoff.
CREATE OR REPLACE FUNCTION public.apply_flow_step(
  p_event_id uuid,
  p_session_id uuid,
  p_expected_version integer,
  p_new_session jsonb,
  p_state jsonb,
  p_outcome text,
  p_messages jsonb
) RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_session uuid := p_session_id;
  v_version integer;
  v_phone text;
BEGIN
  IF v_session IS NULL THEN
    v_phone := p_new_session->>'phone_number';
    UPDATE public.whatsapp_flow_sessions SET status = 'expired', wait_until = NULL, state_version = state_version + 1
    WHERE phone_number = v_phone
      AND (status IN ('waiting_reply', 'waiting_delay') OR (status = 'handed_off' AND updated_at < now() - interval '24 hours'));
    INSERT INTO public.whatsapp_flow_sessions (phone_number, flow_id, flow_version, is_test, enrollment_id, status, current_node_id, variables, wait_until, state_version)
    VALUES (
      v_phone,
      (p_new_session->>'flow_id')::uuid,
      (p_new_session->>'flow_version')::integer,
      COALESCE((p_new_session->>'is_test')::boolean, false),
      (p_new_session->>'enrollment_id')::uuid,
      p_state->>'status',
      p_state->>'current_node_id',
      COALESCE(p_state->'variables', '{}'::jsonb),
      (p_state->>'wait_until')::timestamptz,
      1
    )
    RETURNING id INTO v_session;
  ELSE
    SELECT state_version, phone_number INTO v_version, v_phone FROM public.whatsapp_flow_sessions WHERE id = v_session FOR UPDATE;
    IF NOT FOUND OR v_version IS DISTINCT FROM p_expected_version THEN
      RAISE EXCEPTION 'flow_conflict' USING ERRCODE = '40001';
    END IF;
    UPDATE public.whatsapp_flow_sessions SET
      status = p_state->>'status',
      current_node_id = p_state->>'current_node_id',
      variables = COALESCE(p_state->'variables', '{}'::jsonb),
      wait_until = (p_state->>'wait_until')::timestamptz,
      state_version = v_version + 1
    WHERE id = v_session;
  END IF;

  UPDATE public.whatsapp_flow_events
  SET session_id = v_session, outcome = p_outcome, response_messages = p_messages,
      response_text = (SELECT string_agg(m->>'content', E'\n---\n') FROM jsonb_array_elements(p_messages) m)
  WHERE id = p_event_id AND status = 'pending' AND response_messages IS NULL AND phone_number = v_phone;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'flow_event_missing' USING ERRCODE = '40001';
  END IF;
  RETURN v_session;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_whatsapp_flow(uuid, jsonb, text[], uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_whatsapp_flow(uuid, jsonb, text[], uuid) TO service_role;
REVOKE ALL ON FUNCTION public.set_whatsapp_flow_active(uuid, boolean, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_whatsapp_flow_active(uuid, boolean, uuid) TO service_role;
REVOKE ALL ON FUNCTION private.sync_whatsapp_flow_keywords(uuid, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.sync_whatsapp_flow_keywords(uuid, text[]) TO service_role;
REVOKE ALL ON FUNCTION public.apply_flow_step(uuid, uuid, integer, jsonb, jsonb, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_flow_step(uuid, uuid, integer, jsonb, jsonb, text, jsonb) TO service_role;
