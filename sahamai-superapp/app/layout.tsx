import "./globals.css";

export const metadata = {
  title: "SahamAI — Value Investing Super App (US MVP)",
  description: "Explainable value investing workflow with SEC XBRL fundamentals and price data.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>
        <div className="min-h-screen">
          <header className="border-b bg-white">
            <div className="mx-auto max-w-5xl px-4 py-4 flex items-center justify-between">
              <div className="font-semibold tracking-tight">SahamAI</div>
              <div className="text-sm text-zinc-600">US MVP • SEC XBRL + Price</div>
            </div>
          </header>
          <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
          <footer className="border-t bg-white">
            <div className="mx-auto max-w-5xl px-4 py-6 text-xs text-zinc-500">
              Data sources: SEC EDGAR Company Facts (XBRL JSON) + Stooq price. Educational only.
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
