"use client";

import * as React from "react";
import { BarChart3, TrendingUp } from "lucide-react";
import { AdminPanel } from "@/components/admin/AdminPanel";
import { LoginScreen } from "@/components/auth/LoginScreen";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { ForecastView } from "@/components/forecast/ForecastView";
import { ModuleChooser } from "@/components/home/ModuleChooser";
import { AppHeader } from "@/components/layout/AppHeader";
import { useAuth } from "@/components/providers/AuthProvider";
import { useLocale } from "@/components/providers/LocaleProvider";
import { Badge, Spinner } from "@/components/ui/primitives";
import { UploadScreen } from "@/components/upload/UploadScreen";
import { useDataset } from "@/hooks/useDataset";
import type { AppModule } from "@/types";

export default function HomePage() {
  const { t } = useLocale();
  const { ready, user, logout } = useAuth();
  const { state, uploadFile, reset } = useDataset();
  const [module, setModule] = React.useState<AppModule | null>(null);
  const [opened, setOpened] = React.useState(false);
  const [adminOpen, setAdminOpen] = React.useState(false);

  // Signing out (or losing the session) drops the loaded dataset and returns
  // to the module chooser: the next person at this browser must not see the
  // previous user's data.
  const username = user?.username ?? null;
  React.useEffect(() => {
    if (!username) {
      reset();
      setModule(null);
      setOpened(false);
      setAdminOpen(false);
    }
  }, [username, reset]);

  const datasetReady = state.status === "ready" && !!state.dataset;
  const showModule = module !== null && datasetReady && opened;

  const handleNewFile = () => {
    reset();
    setOpened(false);
  };
  const goHome = () => {
    setModule(null);
    setAdminOpen(false);
  };

  if (!ready) {
    return (
      <>
        <AppHeader />
        <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-[1440px] items-center justify-center px-4">
          <div className="flex items-center gap-2 text-sm text-ink-500" role="status">
            <Spinner className="h-4 w-4 text-accent" />
            {t("auth.checking")}
          </div>
        </main>
      </>
    );
  }

  if (!user) {
    return (
      <>
        <AppHeader />
        <main className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
          <LoginScreen />
        </main>
      </>
    );
  }

  const ModuleIcon = module === "forecast" ? TrendingUp : BarChart3;

  return (
    <>
      <AppHeader
        user={user}
        onLogout={logout}
        onHome={module !== null || adminOpen ? goHome : undefined}
        moduleLabel={module ? t(`home.${module}.title` as "home.drivers.title") : undefined}
        onAdmin={user.role === "admin" ? () => setAdminOpen((v) => !v) : undefined}
        adminActive={adminOpen}
        dataset={
          showModule && state.dataset
            ? { filename: state.dataset.filename, rows: state.dataset.row_count, dateMin: state.dataset.data_quality.date_min, dateMax: state.dataset.data_quality.date_max }
            : null
        }
        onNewFile={showModule ? handleNewFile : undefined}
      />
      <main className="mx-auto min-h-[calc(100vh-3.5rem)] max-w-[1440px] px-4 sm:px-6 lg:px-8">
        {adminOpen && user.role === "admin" ? (
          <AdminPanel onBack={() => setAdminOpen(false)} />
        ) : module === null ? (
          <ModuleChooser
            onSelect={(m) => {
              setModule(m);
              if (datasetReady) setOpened(true);
            }}
            dataset={datasetReady && state.dataset ? { filename: state.dataset.filename, rows: state.dataset.row_count } : null}
            onNewFile={datasetReady ? handleNewFile : undefined}
          />
        ) : showModule && state.dataset ? (
          module === "drivers" ? (
            <Dashboard key={state.dataset.upload_id} dataset={state.dataset} rows={state.rows} />
          ) : (
            <ForecastView key={state.dataset.upload_id} dataset={state.dataset} />
          )
        ) : (
          <>
            <div className="flex justify-center pt-8">
              <Badge tone="accent" className="px-3 py-1 text-xs">
                <ModuleIcon className="h-3.5 w-3.5" />
                {t(`home.${module}.title` as "home.drivers.title")}
              </Badge>
            </div>
            <UploadScreen state={state} onFile={uploadFile} onOpen={() => setOpened(true)} onReset={handleNewFile} />
          </>
        )}
      </main>
    </>
  );
}
