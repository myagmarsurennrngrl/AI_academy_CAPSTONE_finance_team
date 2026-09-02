"use client";

import * as React from "react";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { AppHeader } from "@/components/layout/AppHeader";
import { UploadScreen } from "@/components/upload/UploadScreen";
import { useDataset } from "@/hooks/useDataset";

export default function HomePage() {
  const { state, uploadFile, reset } = useDataset();
  const [stage, setStage] = React.useState<"upload" | "dashboard">("upload");

  const showDashboard = stage === "dashboard" && state.status === "ready" && state.dataset;

  const handleNewFile = () => {
    reset();
    setStage("upload");
  };

  return (
    <>
      <AppHeader
        dataset={
          showDashboard && state.dataset
            ? { filename: state.dataset.filename, rows: state.dataset.row_count, dateMin: state.dataset.data_quality.date_min, dateMax: state.dataset.data_quality.date_max }
            : null
        }
        onNewFile={showDashboard ? handleNewFile : undefined}
      />
      <main className="mx-auto min-h-[calc(100vh-3.5rem)] max-w-[1440px] px-4 sm:px-6 lg:px-8">
        {showDashboard && state.dataset ? (
          <Dashboard key={state.dataset.upload_id} dataset={state.dataset} rows={state.rows} />
        ) : (
          <UploadScreen state={state} onFile={uploadFile} onOpen={() => setStage("dashboard")} onReset={handleNewFile} />
        )}
      </main>
    </>
  );
}
