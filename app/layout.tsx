import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "./_components/Sidebar";
import { PollingProvider } from "./_components/PollingProvider";
import { RootWrapper } from "./_components/RootWrapper";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="h-full">
        <PollingProvider>
          <RootWrapper>
            <Sidebar />
            <div className="flex-1 min-w-0">{children}</div>
          </RootWrapper>
        </PollingProvider>
      </body>
    </html>
  );
}
