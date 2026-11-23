import Image from "next/image";
import tsaColor from "@/figures/1782910605261-h9zk4a76zz7.png";
import tsaWhite from "@/figures/1782910616235-fkyiyymb1v9.png";
import lynxColor from "@/figures/1782911123502-l3bu0r1oi6.png";
import lynxWhite from "@/figures/1782911129843-seud1hunsq.png";
import { companyBrands } from "@/lib/organization";

const logos = {
  tsa: { color: tsaColor, white: tsaWhite },
  lynx: { color: lynxColor, white: lynxWhite },
};

export function Brand({ company, variant }: { company: keyof typeof logos; variant: "color" | "white" }) {
  const logo = logos[company];
  return <Image src={logo[variant]} alt={companyBrands[company].label} sizes="150px" className="brand-logo" />;
}
