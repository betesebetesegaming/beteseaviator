import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "react-hot-toast";
import { AppProviders } from "@/components/AppProviders";
import { PublicEnvScript } from "@/components/public-env-script";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BETESE Aviator",
  description:
    "BETESE Aviator — crash game platform. Deposit with mobile money, bet, cash out before the crash.",
  icons: {
    icon: [{ url: "/icon.png", type: "image/png" }],
    apple: [{ url: "/icon.png", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-950 text-slate-100">
        <PublicEnvScript />
        <AppProviders>
            {children}
          <Toaster
            position="top-center"
            toastOptions={{
              style: { background: "#1e293b", color: "#f1f5f9", border: "1px solid rgba(255,255,255,0.1)" },
            }}
          />
        </AppProviders>
      </body>
    </html>
  );
}
