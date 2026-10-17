import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import qrcode from "qrcode-generator";
import { certificateFilename, pdfSafeText } from "./certificate-text";

// Pure certificate rendering (no I/O), safe for the Cloudflare Worker runtime: pdf-lib and
// qrcode-generator are plain JavaScript. Text uses the built-in Helvetica fonts, which only cover
// WinAnsi, so names are reduced to characters those fonts can draw.

export type CertificateDetails = {
  learnerName: string;
  courseTitle: string;
  issuedAt: string;
  code: string;
  verifyUrl: string;
};

export { pdfSafeText, certificateFilename };

const INK = rgb(0.1, 0.12, 0.18);
const MUTED = rgb(0.4, 0.43, 0.5);
const ACCENT = rgb(0.09, 0.45, 0.35);

export async function renderCertificatePdf(details: CertificateDetails) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([841.89, 595.28]); // A4 landscape
  const { width, height } = page.getSize();
  const serif = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const sansBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const name = pdfSafeText(details.learnerName, "Learner");
  const course = pdfSafeText(details.courseTitle, "the course");
  const issued = new Date(details.issuedAt);
  const date = Number.isNaN(issued.getTime())
    ? ""
    : issued.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      });

  const centered = (
    text: string,
    y: number,
    size: number,
    font = sans,
    color = INK,
  ) => {
    // Shrink to fit so a long course title never runs off the page.
    let fitted = size;
    while (fitted > 10 && font.widthOfTextAtSize(text, fitted) > width - 160)
      fitted -= 1;
    page.drawText(text, {
      x: (width - font.widthOfTextAtSize(text, fitted)) / 2,
      y,
      size: fitted,
      font,
      color,
    });
  };

  page.drawRectangle({
    x: 24,
    y: 24,
    width: width - 48,
    height: height - 48,
    borderColor: ACCENT,
    borderWidth: 3,
  });
  page.drawRectangle({
    x: 34,
    y: 34,
    width: width - 68,
    height: height - 68,
    borderColor: ACCENT,
    borderWidth: 0.75,
  });

  centered("MICROLEARN  ·  EKATRA", height - 90, 12, sansBold, ACCENT);
  centered("Certificate of Completion", height - 150, 40, serif);
  centered("This certifies that", height - 200, 15, sans, MUTED);
  centered(name, height - 260, 44, serif, ACCENT);
  centered("has successfully completed", height - 300, 15, sans, MUTED);
  centered(course, height - 345, 28, serif);
  if (date) centered(`Issued ${date}`, height - 385, 14, sans, MUTED);

  // Verification block: QR to the public verify page, plus the code to type in by hand.
  const qr = qrcode(0, "M");
  qr.addData(details.verifyUrl);
  qr.make();
  const modules = qr.getModuleCount();
  const cell = 3;
  const size = modules * cell;
  const originX = 70;
  const originY = 70;
  page.drawRectangle({
    x: originX - 6,
    y: originY - 6,
    width: size + 12,
    height: size + 12,
    color: rgb(1, 1, 1),
  });
  for (let row = 0; row < modules; row++)
    for (let col = 0; col < modules; col++)
      if (qr.isDark(row, col))
        page.drawRectangle({
          x: originX + col * cell,
          y: originY + (modules - 1 - row) * cell,
          width: cell,
          height: cell,
          color: INK,
        });
  const textX = originX + size + 20;
  page.drawText("Verify this certificate", {
    x: textX,
    y: originY + size - 14,
    size: 12,
    font: sansBold,
    color: INK,
  });
  page.drawText(`Code: ${details.code}`, {
    x: textX,
    y: originY + size - 32,
    size: 11,
    font: sans,
    color: MUTED,
  });
  page.drawText(details.verifyUrl.replace(/^https?:\/\//, ""), {
    x: textX,
    y: originY + size - 48,
    size: 9,
    font: sans,
    color: MUTED,
  });

  pdf.setTitle(`Certificate - ${course}`);
  pdf.setAuthor("MicroLearn by Ekatra");
  return pdf.save();
}
