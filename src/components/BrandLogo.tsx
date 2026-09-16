import logoAsset from "@/assets/ekatra-logo.png.asset.json";
import { APP_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface BrandLogoProps {
  className?: string;
  imageClassName?: string;
  compact?: boolean;
}

const BrandLogo = ({ className, imageClassName, compact = false }: BrandLogoProps) => (
  <span className={cn("inline-flex items-center gap-2", className)}>
    <img
      src={logoAsset.url}
      alt=""
      aria-hidden="true"
      className={cn("h-9 w-9 shrink-0 object-contain", imageClassName)}
    />
    {!compact && <span className="font-bold text-primary">{APP_NAME}</span>}
  </span>
);

export default BrandLogo;