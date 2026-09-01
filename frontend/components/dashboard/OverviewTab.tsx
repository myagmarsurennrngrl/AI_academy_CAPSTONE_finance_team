import { KpiCard } from "@/components/dashboard/KpiCard";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrencyMnt, formatDateRange, formatPercent, formatUnits } from "@/lib/format";
import type { FullAnalysisBundle } from "@/types";

export function OverviewTab({ bundle }: { bundle: FullAnalysisBundle }) {
  const { kpis, dataset_profile } = bundle;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatChip label="Мөр" value={dataset_profile.rows.toLocaleString()} />
        <StatChip label="Огноо" value={formatDateRange(dataset_profile.date_min, dataset_profile.date_max)} />
        <StatChip label="Брэнд" value={dataset_profile.brands.toString()} />
        <StatChip label="Бүтээгдэхүүн" value={dataset_profile.products.toString()} />
        <StatChip label="Суваг" value={dataset_profile.channels.toString()} />
        <StatChip label="Загварын статус" value={bundle.statistical_model.model_status} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard label="Net Sales / Цэвэр борлуулалт" value={formatCurrencyMnt(kpis.net_sales)} />
        <KpiCard label="Gross Profit / Нийт ашиг" value={formatCurrencyMnt(kpis.gross_profit)} />
        <KpiCard
          label="Gross Margin % / Ашгийн хувь"
          value={formatPercent(kpis.gross_margin_pct)}
          tone={kpis.gross_margin_pct >= 0.25 ? "positive" : "negative"}
        />
        <KpiCard label="Net Units / Цэвэр тоо хэмжээ" value={formatUnits(kpis.net_units)} />
        <KpiCard
          label="Return Rate % / Буцаалтын хувь"
          value={formatPercent(kpis.return_rate_pct)}
          tone={kpis.return_rate_pct <= 0.03 ? "positive" : "negative"}
          helpText="Буцаасан нэгжийн тоог борлуулсан нийт нэгжийн тоонд харьцуулсан үзүүлэлт."
        />
        <KpiCard label="Avg Discount % / Дундаж хөнгөлөлт" value={formatPercent(kpis.avg_discount_pct)} />
      </div>

      <Card>
        <CardContent className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
          <MiniStat label="Gross Sales" value={formatCurrencyMnt(kpis.gross_sales)} />
          <MiniStat label="COGS" value={formatCurrencyMnt(kpis.cogs)} />
          <MiniStat label="Total Discount" value={formatCurrencyMnt(kpis.total_discount)} />
          <MiniStat label="Total Promotion" value={formatCurrencyMnt(kpis.total_promotion)} />
          <MiniStat label="Refund Amount" value={formatCurrencyMnt(kpis.refund_amount)} />
          <MiniStat label="Avg Stock Available" value={formatUnits(kpis.avg_stock_available)} />
          <MiniStat label="Low Stock SKUs" value={kpis.low_stock_sku_count.toString()} />
          <MiniStat label="Stockout Observations" value={kpis.stockout_observations.toString()} />
        </CardContent>
      </Card>
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-ink-200 bg-white/70 px-3 py-2 text-center">
      <p className="text-[11px] uppercase tracking-wide text-ink-400">{label}</p>
      <p className="truncate text-sm font-semibold text-ink-800">{value}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-ink-400">{label}</p>
      <p className="text-base font-semibold text-ink-800">{value}</p>
    </div>
  );
}
