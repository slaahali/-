import type { Metadata } from "next";
import { AdminDashboard } from "@/components/admin/AdminDashboard";

export const metadata: Metadata = {
  title: "لوحة الإشراف | ذا شفز",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
  referrer: "no-referrer",
  // Don't let a pasted /admin link unfurl with the campaign card.
  openGraph: null,
  twitter: null,
};

export default function AdminPage() {
  return <AdminDashboard />;
}
