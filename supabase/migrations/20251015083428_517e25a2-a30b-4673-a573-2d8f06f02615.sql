-- Enable the vector extension for AI embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'content_creator', 'learner');

-- Create enum for user status
CREATE TYPE public.user_status AS ENUM ('active', 'inactive', 'suspended');

-- Create enum for course status
CREATE TYPE public.course_status AS ENUM ('draft', 'published', 'archived');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create user_roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'learner',
  status user_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create courses table
CREATE TABLE public.courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status course_status NOT NULL DEFAULT 'draft',
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

-- Create course_modules table
CREATE TABLE public.course_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.course_modules ENABLE ROW LEVEL SECURITY;

-- Create course_resources table
CREATE TABLE public.course_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES public.course_modules(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  url TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.course_resources ENABLE ROW LEVEL SECURITY;

-- Create user_progress table
CREATE TABLE public.user_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  resource_id UUID REFERENCES public.course_resources(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'in_progress',
  progress_percentage INTEGER DEFAULT 0,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, course_id)
);

ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;

-- Create analytics table
CREATE TABLE public.analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.analytics ENABLE ROW LEVEL SECURITY;

-- Create WhatsApp templates table
CREATE TABLE public.whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wati_id TEXT,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  variables TEXT[],
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

-- Create WhatsApp contacts table
CREATE TABLE public.whatsapp_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wati_id TEXT,
  phone_number TEXT NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(phone_number)
);

ALTER TABLE public.whatsapp_contacts ENABLE ROW LEVEL SECURITY;

-- Create chat_history table for AI tutor
CREATE TABLE public.chat_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  response TEXT NOT NULL,
  sources JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.chat_history ENABLE ROW LEVEL SECURITY;

-- Create resource_embeddings table for AI similarity search
CREATE TABLE public.resource_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id UUID NOT NULL REFERENCES public.course_resources(id) ON DELETE CASCADE,
  embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(resource_id)
);

ALTER TABLE public.resource_embeddings ENABLE ROW LEVEL SECURITY;

-- Security definer function to check user role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
      AND status = 'active'
  )
$$;

-- Security definer function to get user role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- RLS Policies for profiles
CREATE POLICY "Users can view all profiles"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Profiles created on signup"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- RLS Policies for user_roles
CREATE POLICY "Users can view all roles"
  ON public.user_roles FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for courses
CREATE POLICY "Anyone can view published courses"
  ON public.courses FOR SELECT
  USING (is_published = true OR created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Content creators can create courses"
  ON public.courses FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'content_creator') OR 
    public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Content creators can update own courses"
  ON public.courses FOR UPDATE
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Content creators can delete own courses"
  ON public.courses FOR DELETE
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- RLS Policies for course_modules
CREATE POLICY "Anyone can view modules of published courses"
  ON public.course_modules FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.courses
      WHERE courses.id = course_modules.course_id
      AND (courses.is_published = true OR courses.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

CREATE POLICY "Course creators can manage modules"
  ON public.course_modules FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.courses
      WHERE courses.id = course_modules.course_id
      AND (courses.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

-- RLS Policies for course_resources
CREATE POLICY "Anyone can view resources of published courses"
  ON public.course_resources FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.course_modules
      JOIN public.courses ON courses.id = course_modules.course_id
      WHERE course_modules.id = course_resources.module_id
      AND (courses.is_published = true OR courses.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

CREATE POLICY "Course creators can manage resources"
  ON public.course_resources FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.course_modules
      JOIN public.courses ON courses.id = course_modules.course_id
      WHERE course_modules.id = course_resources.module_id
      AND (courses.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

-- RLS Policies for user_progress
CREATE POLICY "Users can view own progress"
  ON public.user_progress FOR SELECT
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can update own progress"
  ON public.user_progress FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can modify own progress"
  ON public.user_progress FOR UPDATE
  USING (user_id = auth.uid());

-- RLS Policies for analytics
CREATE POLICY "Users can insert own analytics"
  ON public.analytics FOR INSERT
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Admins can view all analytics"
  ON public.analytics FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for WhatsApp tables
CREATE POLICY "Admins can manage WhatsApp templates"
  ON public.whatsapp_templates FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can view WhatsApp templates"
  ON public.whatsapp_templates FOR SELECT
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'content_creator'));

CREATE POLICY "Admins can manage WhatsApp contacts"
  ON public.whatsapp_contacts FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can view WhatsApp contacts"
  ON public.whatsapp_contacts FOR SELECT
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'content_creator'));

-- RLS Policies for chat_history
CREATE POLICY "Users can view own chat history"
  ON public.chat_history FOR SELECT
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can insert own chat history"
  ON public.chat_history FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- RLS Policies for resource_embeddings
CREATE POLICY "Authenticated users can view embeddings"
  ON public.resource_embeddings FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage embeddings"
  ON public.resource_embeddings FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_roles_updated_at
  BEFORE UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_courses_updated_at
  BEFORE UPDATE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_course_modules_updated_at
  BEFORE UPDATE ON public.course_modules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_course_resources_updated_at
  BEFORE UPDATE ON public.course_resources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_progress_updated_at
  BEFORE UPDATE ON public.user_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_whatsapp_templates_updated_at
  BEFORE UPDATE ON public.whatsapp_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_whatsapp_contacts_updated_at
  BEFORE UPDATE ON public.whatsapp_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert profile
  INSERT INTO public.profiles (id, first_name, last_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', '')
  );
  
  -- Insert default role (learner)
  INSERT INTO public.user_roles (user_id, role, status)
  VALUES (NEW.id, 'learner', 'active');
  
  RETURN NEW;
END;
$$;

-- Trigger for automatic profile and role creation
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create index for vector similarity search
CREATE INDEX IF NOT EXISTS resource_embeddings_embedding_idx 
  ON public.resource_embeddings 
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);