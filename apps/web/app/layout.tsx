import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Skills Aggregator",
    template: "%s | Skills Aggregator",
  },
  description: "Find the best free tutorials for any skill you want to learn, across sports and training.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-ink/10 bg-white/70 backdrop-blur">
          <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
            <Link href="/" className="focus-ring text-sm font-bold uppercase tracking-wide text-ink">
              Skills Aggregator
            </Link>
            <div className="flex items-center gap-4 text-sm font-medium text-graphite">
              <Link className="focus-ring hover:text-court" href="/admin">
                Admin
              </Link>
              <Link className="focus-ring hover:text-court" href="/sitemap.xml">
                Sitemap
              </Link>
            </div>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
