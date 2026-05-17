import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Skills Aggregator",
    template: "%s | Skills Aggregator",
  },
  description:
    "Find the best free tutorials for any skill you want to learn, across sports and training.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="bg-bgGroup text-text">
        <header className="bg-bgGroup">
          <nav className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
            <Link
              href="/"
              className="focus-ring text-base font-extrabold tracking-tight text-ink"
            >
              Skills Aggregator
            </Link>
            <div className="flex items-center gap-4 text-sm font-medium text-muted">
              <Link className="focus-ring transition hover:text-ink" href="/admin">
                Admin
              </Link>
            </div>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
