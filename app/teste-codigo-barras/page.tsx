import type { Metadata } from "next";
import { BarcodeLab } from "@/components/barcode-lab";

export const metadata: Metadata = { title: "Teste de código de barras" };

export default function BarcodeTestPage() {
  return <BarcodeLab />;
}
