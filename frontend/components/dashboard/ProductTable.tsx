import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrencyMnt, formatPercent, formatUnits } from "@/lib/format";
import type { GroupAnalysisRow, InventoryRiskRow, ReturnRiskRow } from "@/types";

export function GroupAnalysisTable({
  title,
  rows,
  nameHeader = "Нэр",
}: {
  title: string;
  rows: GroupAnalysisRow[];
  nameHeader?: string;
}) {
  if (rows.length === 0) return <p className="text-sm text-ink-400">{title}: өгөгдөл алга.</p>;
  return (
    <div>
      <p className="section-label mb-2">{title}</p>
      <Table>
        <THead>
          <TR>
            <TH>{nameHeader}</TH>
            <TH>Цэвэр борлуулалт</TH>
            <TH>Эзлэх хувь</TH>
            <TH>Нийт ашиг</TH>
            <TH>Ашгийн хувь</TH>
            <TH>Буцаалтын хувь</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((r) => (
            <TR key={r.group}>
              <TD className="font-medium text-ink-800">{r.group}</TD>
              <TD>{formatCurrencyMnt(r.net_sales)}</TD>
              <TD>{formatPercent(r.share_of_sales_pct)}</TD>
              <TD>{formatCurrencyMnt(r.gross_profit)}</TD>
              <TD>{formatPercent(r.gross_margin_pct)}</TD>
              <TD>
                <Badge tone={r.return_rate_pct > 0.05 ? "negative" : "neutral"}>
                  {formatPercent(r.return_rate_pct)}
                </Badge>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}

export function ReturnRiskTable({ rows }: { rows: ReturnRiskRow[] }) {
  if (rows.length === 0) return <p className="text-sm text-ink-400">Буцаалтын мэдээлэл алга.</p>;
  return (
    <div>
      <p className="section-label mb-2">Хамгийн өндөр буцаалттай</p>
      <Table>
        <THead>
          <TR>
            <TH>Нэр</TH>
            <TH>Төрөл</TH>
            <TH>Буцаалтын хувь</TH>
            <TH>Буцаасан нэгж</TH>
            <TH>Буцаалтын дүн</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((r, i) => (
            <TR key={i}>
              <TD className="font-medium text-ink-800">{r.name}</TD>
              <TD className="capitalize text-ink-500">{r.dimension}</TD>
              <TD>
                <Badge tone={r.return_rate_pct > 0.05 ? "negative" : "warning"}>
                  {formatPercent(r.return_rate_pct)}
                </Badge>
              </TD>
              <TD>{formatUnits(r.returned_units)}</TD>
              <TD>{formatCurrencyMnt(r.refund_amount)}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}

export function InventoryRiskTable({ rows }: { rows: InventoryRiskRow[] }) {
  const lowStock = rows.filter((r) => r.risk === "low_stock_high_sales");
  const highStock = rows.filter((r) => r.risk === "high_stock_low_sales");

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div>
        <p className="section-label mb-2">Бага үлдэгдэлтэй / өндөр борлуулалттай (нөөц дуусах эрсдэлтэй)</p>
        {lowStock.length === 0 ? (
          <p className="text-sm text-ink-400">Илэрсэн зүйл алга.</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Бүтээгдэхүүн</TH>
                <TH>Үлдэгдэл</TH>
                <TH>Цэвэр тоо</TH>
              </TR>
            </THead>
            <TBody>
              {lowStock.map((r, i) => (
                <TR key={i}>
                  <TD className="font-medium text-ink-800">{r.product}</TD>
                  <TD>
                    <Badge tone="warning">{Math.round(r.stock_available).toLocaleString()}</Badge>
                  </TD>
                  <TD>{formatUnits(r.net_qty)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
      <div>
        <p className="section-label mb-2">Их үлдэгдэлтэй / бага борлуулалттай (удаан хөдлөх нөөц)</p>
        {highStock.length === 0 ? (
          <p className="text-sm text-ink-400">Илэрсэн зүйл алга.</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Бүтээгдэхүүн</TH>
                <TH>Үлдэгдэл</TH>
                <TH>Цэвэр тоо</TH>
              </TR>
            </THead>
            <TBody>
              {highStock.map((r, i) => (
                <TR key={i}>
                  <TD className="font-medium text-ink-800">{r.product}</TD>
                  <TD>{Math.round(r.stock_available).toLocaleString()}</TD>
                  <TD>{formatUnits(r.net_qty)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </div>
  );
}
