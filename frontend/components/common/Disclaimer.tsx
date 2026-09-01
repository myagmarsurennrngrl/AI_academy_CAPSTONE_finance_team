import { Info } from "lucide-react";

export function Disclaimer({ className }: { className?: string }) {
  return (
    <p className={`flex items-start gap-2 text-xs leading-relaxed text-ink-400 ${className ?? ""}`}>
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      Энэхүү шинжилгээ нь өгөгдөлд ажиглагдсан статистик хамаарал болон AI тайлбарт тулгуурласан.
      Хамаарал нь заавал шалтгаант нөлөөллийг илэрхийлэхгүй.
    </p>
  );
}
