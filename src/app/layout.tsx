import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import LiquidBackground from "@/components/ui/LiquidBackground";
import NavBar from "@/components/NavBar";

import { ThemeProvider } from "@/components/ThemeProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Liquid PDF Tools",
    template: "%s | Liquid PDF",
  },
  description: "Privacy-focused PDF tools that run directly in your browser.",
  applicationName: "Liquid PDF Tools",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/liquid-pdf-icon.svg", type: "image/svg+xml", sizes: "any" },
      { url: "/liquid-pdf-mask.svg", rel: "mask-icon", type: "image/svg+xml" },
    ],
    shortcut: "/liquid-pdf-icon.svg",
    apple: [{ url: "/liquid-pdf-icon.svg", type: "image/svg+xml" }],
  },
  appleWebApp: {
    capable: true,
    title: "Liquid PDF",
    statusBarStyle: "default",
  },
  openGraph: {
    type: "website",
    siteName: "Liquid PDF Tools",
    title: "Liquid PDF Tools",
    description: "Privacy-focused PDF tools that run directly in your browser.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <LiquidBackground />
          <NavBar />
          <main className="pt-20 h-screen flex flex-col overflow-hidden">
            {children}
          </main>
        </ThemeProvider>
      </body>
    </html>
  );
}
