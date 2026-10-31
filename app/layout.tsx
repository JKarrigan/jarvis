import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Manrope, Schibsted_Grotesk } from "next/font/google";
import { MotionConfig } from "framer-motion";
import "./globals.css";
import { AppSwitcher } from "./_components/AppSwitcher";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Reel (media) fonts. Both are variable fonts, so no `weight` list (one file
// covers every weight), and they are only used under /media, so they are not
// preloaded on every route.
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  preload: false,
});

const schibstedGrotesk = Schibsted_Grotesk({
  variable: "--font-schibsted",
  subsets: ["latin"],
  preload: false,
});

export const metadata: Metadata = {
  title: { default: "Home", template: "%s · Home" },
  description: "Home server: air quality, lights, files, media and photos",
  applicationName: "Home",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Home",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  colorScheme: "dark",
  viewportFit: "cover",
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
        <MotionConfig reducedMotion="user">
          <AppSwitcher />
          {children}
        </MotionConfig>
      </body>
    </html>
  );
}
