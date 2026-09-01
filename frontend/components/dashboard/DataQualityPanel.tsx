import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import type { DataQualityReport } from "@/types";

const severityTone: Record<string, "negative" | "warning" | "info"> = {
  error: "negative",
  warning: "warning",
  info: "info",
};

const severityIcon: Record<string, ReactNode> = {
  error: <ShieldAlert className="h-3 w-3" />,
  warning: <AlertTriangle className="h-3 w-3" />,
  info: <Info className="h-3 w-3" />,
};

function StatBlock({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-ink-200 bg-white/70 px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-ink-400">{label}</p>
      <p className="text-lg font-semibold text-ink-900">{value}</p>
    </div>
  );
}

export function DataQualityPanel({ report }: { report: DataQualityReport }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatBlock label="Нийт мөр" value={report.total_rows.toLocaleString()} />
        <StatBlock label="Хүчинтэй мөр" value={report.valid_rows.toLocaleString()} />
        <StatBlock label="Хүчингүй мөр" value={report.invalid_rows.toLocaleString()} />
        <StatBlock label="Давхардсан мөр" value={report.duplicate_rows.toLocaleString()} />
        <StatBlock label="Дутуу утга" value={report.missing_value_count.toLocaleString()} />
      </div>

      {report.warnings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Анхааруулга</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {report.warnings.map((w, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-amber-700">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{w}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Автоматаар засварласан зүйлс</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {report.auto_corrections.length === 0 ? (
            <p className="text-sm text-ink-400">Автомат засвар шаардлагагүй байлаа.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Талбар</TH>
                  <TH>Үйлдэл</TH>
                  <TH>Мөрийн тоо</TH>
                </TR>
              </THead>
              <TBody>
                {report.auto_corrections.map((c, i) => (
                  <TR key={i}>
                    <TD className="font-mono text-xs">{c.field ?? "—"}</TD>
                    <TD className="flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      {c.action}
                    </TD>
                    <TD>{c.affected_rows.toLocaleString()}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Илэрсэн асуудлууд</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {report.issues.length === 0 ? (
            <p className="text-sm text-ink-400">Ноцтой чанарын асуудал илрээгүй.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Зэрэг</TH>
                  <TH>Талбар</TH>
                  <TH>Тайлбар</TH>
                  <TH>Мөрийн тоо</TH>
                </TR>
              </THead>
              <TBody>
                {report.issues.map((issue, i) => (
                  <TR key={i}>
                    <TD>
                      <Badge tone={severityTone[issue.severity]}>
                        {severityIcon[issue.severity]}
                        {issue.severity}
                      </Badge>
                    </TD>
                    <TD className="font-mono text-xs">{issue.field ?? "—"}</TD>
                    <TD>{issue.message}</TD>
                    <TD>{issue.affected_rows?.toLocaleString() ?? "—"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
