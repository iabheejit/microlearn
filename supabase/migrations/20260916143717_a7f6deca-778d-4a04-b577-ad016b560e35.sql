ALTER FUNCTION private.match_course_resources(vector, uuid, integer) SET SCHEMA public;
REVOKE ALL ON FUNCTION public.match_course_resources(vector, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_course_resources(vector, uuid, integer) TO authenticated, service_role;