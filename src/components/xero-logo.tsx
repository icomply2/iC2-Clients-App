import Image from "next/image";
import xeroLogo from "./assets/xero-logo.jpg";

type XeroLogoProps = {
  className?: string;
};

export function XeroLogo({ className }: XeroLogoProps) {
  return <Image src={xeroLogo} alt="Xero logo" className={className} priority={false} />;
}
