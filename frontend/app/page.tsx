"use client";

import * as React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileUpload } from "@/components/upload/FileUpload";
import { ExcelRequirementCard } from "@/components/upload/ExcelRequirementCard";
import { ProcessSteps } from "@/components/common/ProcessSteps";
import { Disclaimer } from "@/components/common/Disclaimer";
import { AnalysisProgress } from "@/components/analysis/AnalysisProgress";
import { OverviewTab } from "@/components/dashboard/OverviewTab";
import { DriverChart } from "@/components/charts/DriverChart";
import { SalesTrendChart } from "@/components/charts/SalesTrendChart";
import { PeriodComparisonPanel } from "@/components/charts/PeriodComparisonPanel";
import { ChannelChart } from "@/components/charts/ChannelChart";
import { DiscountChart } from "@/components/charts/DiscountChart";
import { PromotionComparison } from "@/components/charts/PromotionComparison";
import { GroupAnalysisTable, InventoryRiskTable, ReturnRiskTable } from "@/components/dashboard/ProductTable";
import { DataQualityPanel } from "@/components/dashboard/DataQualityPanel";
import { AIInsightPanel } from "@/components/dashboard/AIInsightPanel";
import { FilterBar, ALL_VALUE } from "@/components/dashboard/FilterBar";
import { ApiError, runAnalysis } from "@/lib/api";
import type { AnalysisResponse, AppStage } from "@/types";

const RESULT_TABS = [
  { value: "overview", label: "Ерөнхий тойм" },
  { value: "drivers", label: "Борлуулалтын хүчин зүйл" },
  { value: "trend", label: "Борлуулалтын чиг хандлага" },
  { value: "channel", label: "Сувгийн шинжилгээ" },
  { value: "brand-product", label: "Брэнд & Бүтээгдэхүүн" },
  { value: "discount-promo", label: "Хөнгөлөлт & Урамшуулал" },
  { value: "inventory", label: "Нөөц & Буцаалт" },
  { value: "ai", label: "AI дүгнэлт" },
  { value: "quality", label: "Өгөгдлийн чанар" },
];

export default function HomePage() {
  const [stage, setStage] = React.useState<AppStage>("landing");
  const [progressStep, setProgressStep] = React.useState(0);
  const [result, setResult] = React.useState<AnalysisResponse | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState("overview");
  const [brandFilter, setBrandFilter] = React.useState(ALL_VALUE);
  const [productFilter, setProductFilter] = React.useState(ALL_VALUE);
  const [channelFilter, setChannelFilter] = React.useState(ALL_VALUE);

  async function handleStartAnalysis(uploadId: string) {
    setStage("analyzing");
    setErrorMessage(null);
    setProgressStep(0);

    const timers: ReturnType<typeof setTimeout>[] = [];
    [1, 2, 3].forEach((step, i) => {
      timers.push(setTimeout(() => setProgressStep(step), 650 * (i + 1)));
    });
    timers.push(setTimeout(() => setProgressStep(4), 650 * 4));

    try {
      const response = await runAnalysis(uploadId);
      timers.forEach(clearTimeout);
      setProgressStep(5);
      await sleep(350);
      setProgressStep(6);
      await sleep(350);
      setProgressStep(7);
      await sleep(300);
      setResult(response);
      setActiveTab("overview");
      setBrandFilter(ALL_VALUE);
      setProductFilter(ALL_VALUE);
      setChannelFilter(ALL_VALUE);
      setStage("results");
    } catch (err) {
      timers.forEach(clearTimeout);
      setErrorMessage(err instanceof ApiError ? err.message : "Шинжилгээ хийхэд алдаа гарлаа.");
      setStage("error");
    }
  }

  function resetToLanding() {
    setStage("landing");
    setResult(null);
    setErrorMessage(null);
    setBrandFilter(ALL_VALUE);
    setProductFilter(ALL_VALUE);
    setChannelFilter(ALL_VALUE);
  }

  const filteredBrandRows = React.useMemo(
    () =>
      brandFilter === ALL_VALUE
        ? result?.bundle.brand_analysis ?? []
        : (result?.bundle.brand_analysis ?? []).filter((r) => r.group === brandFilter),
    [result, brandFilter]
  );
  const filteredProductRows = React.useMemo(
    () =>
      productFilter === ALL_VALUE
        ? result?.bundle.product_analysis ?? []
        : (result?.bundle.product_analysis ?? []).filter((r) => r.group === productFilter),
    [result, productFilter]
  );
  const filteredChannelRows = React.useMemo(
    () =>
      channelFilter === ALL_VALUE
        ? result?.bundle.channel_analysis ?? []
        : (result?.bundle.channel_analysis ?? []).filter((r) => r.group === channelFilter),
    [result, channelFilter]
  );
  const filteredReturnRows = React.useMemo(
    () =>
      (result?.bundle.return_analysis ?? []).filter((r) => {
        if (r.dimension === "product" && productFilter !== ALL_VALUE) return r.name === productFilter;
        if (r.dimension === "brand" && brandFilter !== ALL_VALUE) return r.name === brandFilter;
        if (r.dimension === "channel" && channelFilter !== ALL_VALUE) return r.name === channelFilter;
        return true;
      }),
    [result, brandFilter, productFilter, channelFilter]
  );
  const filteredInventoryRows = React.useMemo(
    () =>
      productFilter === ALL_VALUE
        ? result?.bundle.inventory_analysis ?? []
        : (result?.bundle.inventory_analysis ?? []).filter((r) => r.product === productFilter),
    [result, productFilter]
  );

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <Header />

      {stage === "landing" && (
        <div className="mt-10 space-y-10">
          <ProcessSteps />
          <div className="mx-auto max-w-3xl space-y-8">
            <FileUpload onStartAnalysis={handleStartAnalysis} />
            <ExcelRequirementCard />
          </div>
        </div>
      )}

      {stage === "analyzing" && (
        <div className="mt-16">
          <AnalysisProgress currentStep={progressStep} />
        </div>
      )}

      {stage === "error" && (
        <div className="mx-auto mt-16 max-w-lg">
          <Card>
            <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
              <AlertTriangle className="h-9 w-9 text-rose-500" />
              <p className="text-sm font-medium text-ink-800">Шинжилгээ амжилтгүй боллоо</p>
              <p className="text-sm text-ink-500">{errorMessage}</p>
              <Button onClick={resetToLanding}>
                <RotateCcw className="h-4 w-4" />
                Дахин эхлэх
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {stage === "results" && result && (
        <div className="mt-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-500">
              Шинжилгээний ID: <span className="font-mono text-ink-700">{result.analysis_id}</span>
            </p>
            <Button variant="secondary" size="sm" onClick={resetToLanding}>
              <RotateCcw className="h-3.5 w-3.5" />
              Шинэ файл шинжлэх
            </Button>
          </div>

          <FilterBar
            brands={result.bundle.brand_analysis}
            products={result.bundle.product_analysis}
            channels={result.bundle.channel_analysis}
            brand={brandFilter}
            product={productFilter}
            channel={channelFilter}
            onBrandChange={setBrandFilter}
            onProductChange={setProductFilter}
            onChannelChange={setChannelFilter}
          />

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              {RESULT_TABS.map((t) => (
                <TabsTrigger key={t.value} value={t.value}>
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="overview">
              <OverviewTab bundle={result.bundle} />
            </TabsContent>

            <TabsContent value="drivers">
              <Card>
                <CardContent className="p-5">
                  <DriverChart drivers={result.bundle.driver_ranking} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="trend">
              <div className="space-y-6">
                <Card>
                  <CardContent className="p-5">
                    <PeriodComparisonPanel timeAnalysis={result.bundle.time_analysis} />
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-5">
                    <SalesTrendChart timeAnalysis={result.bundle.time_analysis} />
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="channel">
              <ChannelChart data={filteredChannelRows} />
            </TabsContent>

            <TabsContent value="brand-product">
              <div className="space-y-8">
                <Card>
                  <CardContent className="p-5">
                    <GroupAnalysisTable title="Топ брэндүүд" rows={filteredBrandRows} nameHeader="Брэнд" />
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-5">
                    <GroupAnalysisTable
                      title="Топ бүтээгдэхүүн"
                      rows={filteredProductRows}
                      nameHeader="Бүтээгдэхүүн"
                    />
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-5">
                    <GroupAnalysisTable
                      title="Хамгийн бага гүйцэтгэлтэй бүтээгдэхүүн"
                      rows={[...filteredProductRows].sort((a, b) => a.net_sales - b.net_sales)}
                      nameHeader="Бүтээгдэхүүн"
                    />
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="discount-promo">
              <div className="space-y-6">
                <DiscountChart data={result.bundle.discount_analysis} />
                <PromotionComparison data={result.bundle.promotion_analysis} />
              </div>
            </TabsContent>

            <TabsContent value="inventory">
              <div className="space-y-8">
                <Card>
                  <CardContent className="p-5">
                    <ReturnRiskTable rows={filteredReturnRows} />
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-5">
                    <InventoryRiskTable rows={filteredInventoryRows} />
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="ai">
              <AIInsightPanel english={result.ai_english} mongolian={result.ai_mongolian} meta={result.meta} />
            </TabsContent>

            <TabsContent value="quality">
              <DataQualityPanel report={result.bundle.data_quality} />
            </TabsContent>
          </Tabs>

          <Disclaimer className="border-t border-ink-200 pt-4" />
        </div>
      )}
    </main>
  );
}

function Header() {
  return (
    <header className="text-center">
      <p className="section-label mb-2">AI + Statistical Analytics</p>
      <h1 className="text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
        Sales Driver Intelligence
      </h1>
      <p className="mt-1 text-lg font-medium text-ink-500">
        Борлуулалтад нөлөөлөх хүчин зүйлийн шинжилгээ
      </p>
      <p className="mx-auto mt-4 max-w-2xl text-sm text-ink-500">
        Excel өгөгдлөөс борлуулалтын гол хөдөлгөгч хүчин зүйлсийг AI болон статистик
        шинжилгээгээр тодорхойлно.
      </p>
    </header>
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
