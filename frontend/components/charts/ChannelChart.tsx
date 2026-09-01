import { Card, CardContent } from "@/components/ui/card";
import { GroupMetricBarChart } from "@/components/charts/GroupMetricBarChart";
import { CATEGORICAL } from "@/lib/chartColors";
import { formatCurrencyMnt, formatPercent } from "@/lib/format";
import type { GroupAnalysisRow } from "@/types";

export function ChannelChart({ data }: { data: GroupAnalysisRow[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-ink-400">Сувгийн мэдээлэл олдсонгүй.</p>;
  }
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <Card>
        <CardContent className="p-5">
          <GroupMetricBarChart
            data={data}
            metric="net_sales"
            label="Цэвэр борлуулалт сувгаар"
            color={CATEGORICAL[0]}
            formatter={formatCurrencyMnt}
          />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-5">
          <GroupMetricBarChart
            data={data}
            metric="gross_profit"
            label="Нийт ашиг сувгаар"
            color={CATEGORICAL[2]}
            formatter={formatCurrencyMnt}
          />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-5">
          <GroupMetricBarChart
            data={data}
            metric="gross_margin_pct"
            label="Нийт ашгийн хувь сувгаар"
            color={CATEGORICAL[6]}
            formatter={(v) => formatPercent(v)}
          />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-5">
          <GroupMetricBarChart
            data={data}
            metric="return_rate_pct"
            label="Буцаалтын хувь сувгаар"
            color={CATEGORICAL[7]}
            formatter={(v) => formatPercent(v)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
