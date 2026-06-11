import type { Metadata } from "next";
import Link from "next/link";
import { LocalActionSync } from "@/components/LocalActionSync";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Subskills",
    template: "%s | Subskills",
  },
  description:
    "Find the best free tutorials for any skill you want to learn, across sports and training.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col bg-bgGroup text-text">
        <header className="bg-bgGroup">
          <nav className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-4 sm:py-5">
            <Link
              href="/"
              className="focus-ring whitespace-nowrap text-base font-extrabold tracking-tight text-ink"
            >
              Subskills
            </Link>
            <div className="flex items-center gap-3 text-[13px] font-medium text-muted sm:gap-4 sm:text-sm">
              <Link className="focus-ring whitespace-nowrap transition hover:text-ink" href="/suggest">
                Suggest
              </Link>
              <Link className="focus-ring whitespace-nowrap transition hover:text-ink" href="/contributors">
                Contributors
              </Link>
              <Link className="focus-ring whitespace-nowrap transition hover:text-ink" href="/sign-in">
                Sign in
              </Link>
              <Link className="focus-ring whitespace-nowrap transition hover:text-ink" href="/admin">
                Admin
              </Link>
            </div>
          </nav>
        </header>
        <LocalActionSync />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-divider">
          <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted">
            <span>© {new Date().getFullYear()} Subskills</span>
            <div className="flex items-center gap-4">
              <Link className="focus-ring transition hover:text-ink" href="/privacy">
                Privacy
              </Link>
              <Link className="focus-ring transition hover:text-ink" href="/suggest">
                Suggest a link
              </Link>
              <Link className="focus-ring transition hover:text-ink" href="/contributors">
                Contributors
              </Link>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
