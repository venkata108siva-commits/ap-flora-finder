import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000"),
  title: "Global Flora Finder · Identify any plant with verified science",
  description:
    "Snap a photo of any plant and get its identity, taxonomy, distribution, conservation status, phytochemicals with concentrations, and medicinal, ethnobotanical and economic uses, each linked to verified sources.",
  applicationName: "Global Flora Finder",
  appleWebApp: { capable: true, title: "Flora Finder", statusBarStyle: "black-translucent" },
  openGraph: {
    title: "Global Flora Finder",
    description: "Snap any plant. Get verified science: taxonomy, distribution, conservation, chemistry & uses.",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#062a1d",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
