// Light helpers shared by the PDF renderer and certificate lookups (no PDF library imported here).

/** Strips diacritics and anything Helvetica cannot draw; never returns an empty string. */
export function pdfSafeText(value: string, fallback: string) {
  const cleaned = value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || fallback;
}

export function certificateFilename(courseTitle: string) {
  const safe = pdfSafeText(courseTitle, "Course")
    .replace(/[^A-Za-z0-9 _-]/g, "")
    .trim();
  return `Certificate - ${safe || "Course"}.pdf`;
}
