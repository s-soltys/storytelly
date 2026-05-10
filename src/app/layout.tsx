import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { QueryProvider } from "@/components/QueryProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Storytelly",
  description: "Manage worlds for AI-generated music videos",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <QueryProvider>
          <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
            <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
              <Link href="/" className="font-mono text-xl uppercase tracking-widest">
                <span className="text-[var(--color-accent)]">Story</span>telly
              </Link>
              <span className="text-xs text-[var(--color-muted)] font-mono uppercase">
                v0.1
              </span>
            </div>
          </header>
          <main className="flex-1 mx-auto w-full max-w-6xl px-6 py-8">
            {children}
          </main>
        </QueryProvider>
      </body>
    </html>
  );
}
