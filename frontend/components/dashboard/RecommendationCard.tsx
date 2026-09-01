import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ManagementRecommendation } from "@/types";
import { cn } from "@/lib/utils";

const PRIORITY_TONE: Record<string, "negative" | "warning" | "neutral"> = {
  High: "negative",
  Medium: "warning",
  Low: "neutral",
};

const PRIORITY_LABEL: Record<string, string> = {
  High: "ӨНДӨР ЧУХАЛ",
  Medium: "ДУНД ЗЭРЭГ",
  Low: "БАГА ЧУХАЛ",
};

export function RecommendationCard({ rec }: { rec: ManagementRecommendation }) {
  return (
    <Card
      className={cn(
        "border-l-4",
        rec.priority === "High" && "border-l-rose-400",
        rec.priority === "Medium" && "border-l-amber-400",
        rec.priority === "Low" && "border-l-ink-300"
      )}
    >
      <CardContent className="p-5">
        <Badge tone={PRIORITY_TONE[rec.priority]} className="mb-3">
          {PRIORITY_LABEL[rec.priority] ?? rec.priority}
        </Badge>
        <p className="text-sm font-semibold text-ink-900">{rec.action}</p>
        <div className="mt-3 space-y-2 text-sm text-ink-600">
          <p>
            <span className="font-medium text-ink-500">Нотолгоо: </span>
            {rec.reason}
          </p>
          <p>
            <span className="font-medium text-ink-500">Хүлээгдэж буй үр дүн: </span>
            {rec.expected_business_effect}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
