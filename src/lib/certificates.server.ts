import type { SupabaseClient } from "@supabase/supabase-js";
import { certificateFilename } from "./certificate-pdf";

// The only place certificates are looked up for the public verify page and PDF. Callers get the
// learner's name, course, date and code — never the phone number or user id.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any>;

export type CertificateRecord = {
  code: string;
  learnerName: string;
  courseTitle: string;
  issuedAt: string;
};

export const CODE_PATTERN = /^[0-9A-F]{16}$/;

export function normalizeCode(value: string) {
  const code = value.trim().toUpperCase();
  return CODE_PATTERN.test(code) ? code : null;
}

async function courseTitle(client: Client, courseId: string) {
  const { data, error } = await client
    .from("courses")
    .select("title")
    .eq("id", courseId)
    .maybeSingle();
  if (error) throw error;
  return (data?.title as string | undefined) ?? "Course";
}

export async function findCertificate(
  client: Client,
  rawCode: string,
): Promise<CertificateRecord | null> {
  const code = normalizeCode(rawCode);
  if (!code) return null;

  const { data: whatsapp, error } = await client
    .from("course_certificates")
    .select("course_id,learner_name,issued_at")
    .eq("verification_code", code)
    .maybeSingle();
  if (error) throw error;
  if (whatsapp)
    return {
      code,
      learnerName: (whatsapp.learner_name as string) || "Learner",
      courseTitle: await courseTitle(client, whatsapp.course_id as string),
      issuedAt: whatsapp.issued_at as string,
    };

  const { data: web, error: webError } = await client
    .from("web_course_certificates")
    .select("course_id,user_id,issued_at")
    .eq("verification_code", code)
    .maybeSingle();
  if (webError) throw webError;
  if (!web) return null;
  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("first_name,last_name")
    .eq("id", web.user_id as string)
    .maybeSingle();
  if (profileError) throw profileError;
  const name = [profile?.first_name, profile?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  return {
    code,
    learnerName: name || "Learner",
    courseTitle: await courseTitle(client, web.course_id as string),
    issuedAt: web.issued_at as string,
  };
}

/** Public base URL of the app: PUBLIC_APP_URL when set, else the origin the request arrived on. */
export function appBaseUrl(request?: Request) {
  const configured = process.env.PUBLIC_APP_URL?.trim();
  const base = configured || (request ? new URL(request.url).origin : "");
  return base.replace(/\/+$/, "");
}

export function certificateUrls(base: string, code: string) {
  return {
    verifyUrl: `${base}/verify/${code}`,
    pdfUrl: `${base}/api/public/certificates/${code}`,
  };
}

export function certificateAttachment(
  base: string,
  record: Pick<CertificateRecord, "code" | "courseTitle">,
) {
  return {
    ...certificateUrls(base, record.code),
    filename: certificateFilename(record.courseTitle),
  };
}
