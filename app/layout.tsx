import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { Toaster } from "react-hot-toast";
import { AppProviders } from "@/components/AppProviders";
import { PublicEnvScript } from "@/components/public-env-script";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BETESE Aviator",
  description:
    "BETESE Aviator — crash game platform. Deposit with mobile money, bet, cash out before the crash.",
  applicationName: "BETESE Aviator",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "BETESE Aviator",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/app-icon.png", type: "image/png" },
      { url: "/icon.png", type: "image/png" },
    ],
    apple: [{ url: "/app-icon.png", type: "image/png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0b" },
    { media: "(prefers-color-scheme: light)", color: "#0b0b0b" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-slate-950 text-slate-100" suppressHydrationWarning>
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
