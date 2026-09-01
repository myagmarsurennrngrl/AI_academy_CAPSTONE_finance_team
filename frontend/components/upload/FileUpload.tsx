"use client";

import * as React from "react";
import {
  UploadCloud,
  FileSpreadsheet,
  Download,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  X,
} from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ApiError, sampleDownloadUrl, uploadExcel } from "@/lib/api";
import { formatBytes, formatDateRange } from "@/lib/format";
import type { UploadResponse } from "@/types";
import { cn } from "@/lib/utils";

const ACCEPTED_EXTENSIONS = [".xlsx", ".xls"];

interface FileUploadProps {
  onStartAnalysis: (uploadId: string) => void;
}

export function FileUpload({ onStartAnalysis }: FileUploadProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [dragActive, setDragActive] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [uploadResult, setUploadResult] = React.useState<UploadResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const isValidExtension = (name: string) =>
    ACCEPTED_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));

  const handleFile = React.useCallback(async (selected: File) => {
    setError(null);
    setUploadResult(null);

    if (!isValidExtension(selected.name)) {
      setError("Зөвхөн .xlsx (эсвэл .xls) файл сонгоно уу.");
      return;
    }

    setFile(selected);
    setUploading(true);
    try {
      const result = await uploadExcel(selected);
      setUploadResult(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Файл боловсруулахад алдаа гарлаа.");
    } finally {
      setUploading(false);
    }
  }, []);

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) handleFile(dropped);
  }

  function reset() {
    setFile(null);
    setUploadResult(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  const profile = uploadResult?.profile;

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-6">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={onDrop}
          className={cn(
            "flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors",
            dragActive ? "border-accent-400 bg-accent-50/60" : "border-ink-300 bg-ink-50/60"
          )}
        >
          {!file && (
            <>
              <UploadCloud className="mb-3 h-9 w-9 text-ink-400" />
              <p className="text-sm font-medium text-ink-700">
                Excel файлаа энд чирж оруулах эсвэл товч дарж сонгоно уу
              </p>
              <p className="mt-1 text-xs text-ink-400">Дэмждэг формат: .xlsx</p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                <Button onClick={() => inputRef.current?.click()}>
                  <FileSpreadsheet className="h-4 w-4" />
                  Excel файл сонгох
                </Button>
                <a href={sampleDownloadUrl()} download className={buttonClasses("secondary")}>
                  <Download className="h-4 w-4" />
                  Жишээ Excel татах
                </a>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </>
          )}

          {file && (
            <div className="w-full text-left">
              <div className="flex items-center justify-between rounded-lg border border-ink-200 bg-white/80 px-4 py-3">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="h-5 w-5 text-accent-600" />
                  <div>
                    <p className="text-sm font-medium text-ink-800">{file.name}</p>
                    <p className="text-xs text-ink-400">{formatBytes(file.size)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {uploading && (
                    <Badge tone="info">
                      <Loader2 className="h-3 w-3 animate-spin" /> Боловсруулж байна
                    </Badge>
                  )}
                  {!uploading && uploadResult && uploadResult.can_analyze && (
                    <Badge tone="positive">
                      <CheckCircle2 className="h-3 w-3" /> Бэлэн
                    </Badge>
                  )}
                  {!uploading && uploadResult && !uploadResult.can_analyze && (
                    <Badge tone="negative">
                      <AlertTriangle className="h-3 w-3" /> Дутуу багана
                    </Badge>
                  )}
                  <button
                    onClick={reset}
                    className="rounded-full p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                    aria-label="Цуцлах"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {error && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>{error}</p>
                </div>
              )}

              {uploadResult?.blocking_errors && uploadResult.blocking_errors.length > 0 && (
                <div className="mt-3 space-y-1 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {uploadResult.blocking_errors.map((msg, i) => (
                    <p key={i}>{msg}</p>
                  ))}
                </div>
              )}

              {profile && (
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  <StatTile label="Мөр" value={profile.rows.toLocaleString()} />
                  <StatTile label="Багана" value={profile.columns.toString()} />
                  <StatTile
                    label="Огнооны хугацаа"
                    value={formatDateRange(profile.date_min, profile.date_max)}
                    wide
                  />
                  <StatTile label="Брэнд" value={profile.brands.toString()} />
                  <StatTile label="Бүтээгдэхүүн" value={profile.products.toString()} />
                  <StatTile label="Суваг" value={profile.channels.toString()} />
                </div>
              )}

              <div className="mt-5 flex justify-end">
                <Button
                  size="lg"
                  disabled={!uploadResult?.can_analyze || uploading}
                  onClick={() => uploadResult && onStartAnalysis(uploadResult.upload_id)}
                >
                  <Sparkles className="h-4 w-4" />
                  Шинжилгээ эхлүүлэх
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function StatTile({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={cn("rounded-lg border border-ink-200 bg-white/70 px-3 py-2", wide && "col-span-2")}>
      <p className="text-[11px] uppercase tracking-wide text-ink-400">{label}</p>
      <p className="truncate text-sm font-semibold text-ink-800">{value}</p>
    </div>
  );
}
