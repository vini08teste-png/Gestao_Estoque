import type { Metadata } from "next";
import { isCompany } from "@/lib/organization";

export async function generateMetadata({ params }: LayoutProps<"/[companyId]">): Promise<Metadata> {
  const { companyId } = await params;
  if (!isCompany(companyId)) return {};
  const icon = companyId === "lynx" ? "/favicon-lynx-20261127.png" : "/favicon-tsa.png";
  return { icons: { icon: { url: icon, type: "image/png", sizes: "64x64" } } };
}

export default function CompanyLayout({ children }: LayoutProps<"/[companyId]">) {
  return children;
}
