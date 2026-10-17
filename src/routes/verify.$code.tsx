import { createFileRoute } from "@tanstack/react-router";
import { verifyCertificate } from "@/lib/certificates.functions";

export const Route = createFileRoute("/verify/$code")({
  loader: ({ params }) => verifyCertificate({ data: { code: params.code } }),
  head: ({ loaderData }) => {
    const title = loaderData?.found
      ? `${loaderData.learnerName} completed ${loaderData.courseTitle}`
      : "Certificate verification";
    return {
      meta: [
        { title },
        { property: "og:title", content: title },
        {
          property: "og:description",
          content: "Verified certificate issued by Ekatra · MicroLearn",
        },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: VerifyPage,
});

function VerifyPage() {
  const result = Route.useLoaderData();
  const { code } = Route.useParams();
  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 text-center shadow-sm space-y-4">
        {result.found ? (
          <>
            <div className="text-4xl">✅</div>
            <h1 className="text-xl font-semibold">Verified certificate</h1>
            <div className="space-y-1">
              <p className="text-2xl font-semibold">{result.learnerName}</p>
              <p className="text-muted-foreground">completed</p>
              <p className="text-lg font-medium">{result.courseTitle}</p>
              <p className="text-sm text-muted-foreground">
                Issued{" "}
                {new Date(result.issuedAt).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                  timeZone: "UTC",
                })}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Code {result.code} · Issued by Ekatra · MicroLearn
            </p>
            <a
              href={result.pdfUrl}
              className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              Download PDF
            </a>
          </>
        ) : (
          <>
            <div className="text-4xl">🔍</div>
            <h1 className="text-xl font-semibold">
              No certificate matches this code
            </h1>
            <p className="text-sm text-muted-foreground">
              Check the code and try again: <span className="font-mono">{code}</span>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
