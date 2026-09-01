"use client";

import * as React from "react";
import { AlertTriangle, Lightbulb, ShieldAlert, Sparkles, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RecommendationCard } from "@/components/dashboard/RecommendationCard";
import { cn } from "@/lib/utils";
import type { AIAnalysisResult, AnalysisMeta } from "@/types";

function InsightList({ icon, title, items }: { icon: React.ReactNode; title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {items.map((item, i) => (
          <p key={i} className="rounded-lg bg-ink-50/80 px-3 py-2 text-sm text-ink-700">
            {item}
          </p>
        ))}
      </CardContent>
    </Card>
  );
}

const confidenceTone: Record<string, "positive" | "warning" | "neutral"> = {
  high: "positive",
  High: "positive",
  medium: "warning",
  Medium: "warning",
  low: "neutral",
  Low: "neutral",
};

export function AIInsightPanel({
  english,
  mongolian,
  meta,
}: {
  english: AIAnalysisResult;
  mongolian: AIAnalysisResult | null;
  meta: AnalysisMeta;
}) {
  const [lang, setLang] = React.useState<"mn" | "en">(mongolian ? "mn" : "en");
  const data = lang === "mn" && mongolian ? mongolian : english;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent-600" />
          <p className="text-sm font-semibold text-ink-800">AI Удирдлагын дүгнэлт</p>
          {meta.mock_ai && <Badge tone="info">Mock AI горим</Badge>}
        </div>
        <div className="flex gap-1 rounded-lg border border-ink-200 bg-white/70 p-1">
          <button
            onClick={() => setLang("mn")}
            disabled={!mongolian}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40",
              lang === "mn" ? "bg-ink-900 text-white" : "text-ink-500 hover:bg-ink-100"
            )}
          >
            Монгол
          </button>
          <button
            onClick={() => setLang("en")}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              lang === "en" ? "bg-ink-900 text-white" : "text-ink-500 hover:bg-ink-100"
            )}
          >
            English
          </button>
        </div>
      </div>

      {!mongolian && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Монгол орчуулга түр боломжгүй байна. English analysis is available.
            {meta.translation_error ? ` (${meta.translation_error})` : ""}
          </p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Гүйцэтгэлийн товч дүгнэлт</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm leading-relaxed text-ink-700">{data.executive_summary}</p>
          <p className="mt-3 text-sm leading-relaxed text-ink-600">{data.performance_overview}</p>
        </CardContent>
      </Card>

      {data.top_drivers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-accent-600" />
              Топ борлуулалтын хүчин зүйлс
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {data.top_drivers.map((d) => (
              <div key={d.rank} className="rounded-lg border border-ink-100 bg-white/70 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-ink-800">
                    #{d.rank} {d.driver}
                  </p>
                  <Badge tone={confidenceTone[d.confidence] ?? "neutral"}>{d.confidence}</Badge>
                </div>
                <p className="mt-1 text-xs uppercase tracking-wide text-ink-400">{d.direction}</p>
                <p className="mt-2 text-sm text-ink-600">{d.business_impact}</p>
                <p className="mt-1 text-xs italic text-ink-400">{d.evidence}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        <InsightList icon={<Sparkles className="h-4 w-4 text-accent-600" />} title="Сувгийн ойлголт" items={data.channel_insights} />
        <InsightList icon={<Sparkles className="h-4 w-4 text-accent-600" />} title="Брэнд / бүтээгдэхүүний ойлголт" items={data.brand_product_insights} />
        <InsightList icon={<Sparkles className="h-4 w-4 text-accent-600" />} title="Үнэ, хөнгөлөлтийн ойлголт" items={data.pricing_discount_insights} />
        <InsightList icon={<Sparkles className="h-4 w-4 text-accent-600" />} title="Урамшууллын ойлголт" items={data.promotion_insights} />
      </div>

      <InsightList
        icon={<ShieldAlert className="h-4 w-4 text-rose-600" />}
        title="Буцаалт ба нөөцийн эрсдэл"
        items={data.returns_inventory_risks}
      />
      <InsightList
        icon={<Lightbulb className="h-4 w-4 text-amber-600" />}
        title="Боломжууд"
        items={data.opportunities}
      />

      {data.management_recommendations.length > 0 && (
        <div>
          <p className="section-label mb-3">Удирдлагад зориулсан зөвлөмж</p>
          <div className="grid gap-4 md:grid-cols-2">
            {data.management_recommendations.map((rec, i) => (
              <RecommendationCard key={i} rec={rec} />
            ))}
          </div>
        </div>
      )}

      {data.data_limitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Өгөгдлийн хязгаарлалт</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 pt-0">
            {data.data_limitations.map((l, i) => (
              <p key={i} className="text-xs text-ink-500">
                • {l}
              </p>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
