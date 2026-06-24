import type { Metadata } from "next";
import { Geist, Geist_Mono, Manrope, Schibsted_Grotesk } from "next/font/google";
import "./globals.css";
import { PollingProvider } from "./_components/PollingProvider";
import { AppSwitcher } from "./_components/AppSwitcher";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const schibstedGrotesk = Schibsted_Grotesk({
  variable: "--font-schibsted",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "AirGradient Dashboard",
  description: "Local air quality monitor",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${manrope.variable} ${schibstedGrotesk.variable} h-full antialiased dark`}
    >
      <body className="h-full">
        <PollingProvider>
          <AppSwitcher />
          {children}
        </PollingProvider>
      </body>
    </html>
  );
}
