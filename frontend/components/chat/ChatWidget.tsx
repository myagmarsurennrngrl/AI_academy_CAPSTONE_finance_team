"use client";

import * as React from "react";
import { MessageSquare, Send, Sparkles, Trash2, X } from "lucide-react";
import { useLocale } from "@/components/providers/LocaleProvider";
import { Badge, Button, Spinner } from "@/components/ui/primitives";
import { useChat, type ChatUiMessage } from "@/hooks/useChat";
import { formatDateRange, formatMonth } from "@/lib/format";
import type { StringKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { AppModule, DatasetResponse, FilterSpec, Locale } from "@/types";

interface Props {
  uploadId: string;
  dataset: DatasetResponse;
  /** the module's active filter - sent with every question as the default scope */
  spec: FilterSpec;
  module: AppModule;
}

type T = (key: StringKey, vars?: Record<string, string | number>) => string;

function describeScope(spec: FilterSpec, locale: Locale, t: T): string {
  const parts: string[] = [];
  const dims: [string[], StringKey][] = [
    [spec.brands, "filters.brand"],
    [spec.products, "filters.product"],
    [spec.channels, "filters.channel"],
    [spec.channel_types, "filters.channelType"],
    [spec.sales_types, "filters.salesType"],
  ];
  for (const [values, key] of dims) {
    if (values.length) parts.push(`${t(key)}: ${values.length > 2 ? `${values.slice(0, 2).join(", ")} +${values.length - 2}` : values.join(", ")}`);
  }
  if (spec.date_from || spec.date_to) parts.push(formatDateRange(spec.date_from, spec.date_to, locale));
  return parts.length ? parts.join(" · ") : t("chat.scope.all");
}

function buildSuggestions(dataset: DatasetResponse, module: AppModule, locale: Locale, t: T): string[] {
  const { products, months } = dataset.dimensions;
  const product = products[0];
  const years = Array.from(new Set(months.map((m) => m.slice(0, 4)))).sort();
  const out: string[] = [];
  if (product && years.length >= 2) {
    out.push(t("chat.suggest.yoy", { product, year: years[years.length - 1] }));
  } else if (product && months.length >= 2) {
    out.push(t("chat.suggest.mom", { product, month: formatMonth(months[months.length - 1], locale) }));
  }
  if (module === "forecast") out.push(t("chat.suggest.forecast"));
  out.push(t("chat.suggest.channel"));
  out.push(t("chat.suggest.margin"));
  return out.slice(0, 3);
}

/** Minimal, safe rendering of the assistant's text: paragraphs, "-"/"•"/"1." bullets, **bold**. */
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-semibold text-ink-900">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    )
  );
}

function MessageBody({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (!list.length) return;
    blocks.push(
      <ul key={`l${blocks.length}`} className="list-disc space-y-1 pl-4">
        {list.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </ul>
    );
    list = [];
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^#+\s*/, "");
    const bullet = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
    if (bullet) {
      list.push(bullet[1]);
      continue;
    }
    flush();
    if (line.trim()) blocks.push(<p key={`p${blocks.length}`}>{renderInline(line)}</p>);
  }
  flush();
  return <div className="space-y-1.5">{blocks}</div>;
}

function Bubble({ message, t }: { message: ChatUiMessage; t: T }) {
  const user = message.role === "user";
  return (
    <div className={cn("flex flex-col", user ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[88%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
          user ? "rounded-br-md bg-accent text-white" : "rounded-bl-md bg-surface2 text-ink-700"
        )}
      >
        {user ? <p className="whitespace-pre-wrap">{message.content}</p> : <MessageBody text={message.content} />}
      </div>
      {!user && (message.toolCalls || message.mock) && (
        <p className="mt-1 flex items-center gap-1.5 px-1 text-[10px] text-ink-400">
          {message.toolCalls ? t("chat.computed", { n: message.toolCalls }) : null}
          {message.mock && <Badge tone="warning">{t("chat.mock")}</Badge>}
        </p>
      )}
    </div>
  );
}

/** Floating AI data assistant (bottom-right). Answers come only from the
 *  uploaded Excel file: the backend lets the model call deterministic pandas
 *  tools and compose the reply from those numbers. */
export function ChatWidget({ uploadId, dataset, spec, module }: Props) {
  const { t, locale } = useLocale();
  const chat = useChat(uploadId, spec, module, locale);
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const listRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  const scopeLabel = React.useMemo(() => describeScope(spec, locale, t), [spec, locale, t]);
  const suggestions = React.useMemo(() => buildSuggestions(dataset, module, locale, t), [dataset, module, locale, t]);

  React.useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [open, chat.messages, chat.loading, chat.error]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const submit = (text?: string) => {
    const question = (text ?? draft).trim();
    if (!question || chat.loading) return;
    chat.send(question);
    setDraft("");
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("chat.open")}
        className="fixed bottom-4 right-4 z-40 inline-flex h-11 items-center gap-2 rounded-full bg-accent pl-4 pr-5 text-sm font-medium text-white shadow-pop transition-colors hover:bg-accentHover focus-ring"
      >
        <MessageSquare className="h-4 w-4" aria-hidden="true" />
        {t("chat.open")}
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-label={t("chat.title")}
      className="fixed bottom-4 right-4 z-40 flex w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-card border border-line bg-surface shadow-pop"
      style={{ height: "min(600px, calc(100vh - 6rem))" }}
    >
      {/* Header */}
      <div className="flex items-start gap-3 border-b border-line px-4 py-3">
        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accentSoft text-accent" aria-hidden="true">
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="text-sm font-semibold text-ink-900">{t("chat.title")}</p>
          <p className="truncate text-[11px] text-ink-500">{t("chat.subtitle")}</p>
        </div>
        {chat.messages.length > 0 && (
          <Button variant="ghost" size="sm" className="px-2" onClick={chat.clear} aria-label={t("chat.clear")} title={t("chat.clear")}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
        <Button variant="ghost" size="sm" className="px-2" onClick={() => setOpen(false)} aria-label={t("chat.close")} title={t("chat.close")}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Scope */}
      <p className="truncate border-b border-line bg-surface2/60 px-4 py-1.5 text-[11px] text-ink-500" title={scopeLabel}>
        <span className="font-medium text-ink-600">{t("chat.scope")}:</span> {scopeLabel}
      </p>

      {/* Messages */}
      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {chat.messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm leading-relaxed text-ink-600">{t("chat.intro")}</p>
            <div className="flex flex-col items-start gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => submit(s)}
                  className="rounded-ctl border border-line bg-surface px-3 py-1.5 text-left text-[13px] leading-snug text-ink-700 transition-colors hover:border-lineStrong hover:bg-surface2 focus-ring"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {chat.messages.map((m) => (
          <Bubble key={m.id} message={m} t={t} />
        ))}
        {chat.loading && (
          <div className="flex items-center gap-2 text-xs text-ink-500" role="status">
            <Spinner className="h-3.5 w-3.5 text-accent" />
            {t("chat.thinking")}
          </div>
        )}
        {chat.error && !chat.loading && (
          <div role="alert" className="rounded-ctl border border-negative/30 bg-negativeSoft/50 px-3 py-2 text-xs text-negative">
            <p>{chat.error === "network" ? t("chat.errorNetwork") : `${t("chat.error")} ${chat.error}`}</p>
            <button type="button" onClick={chat.retry} className="mt-1 font-medium underline-offset-2 hover:underline focus-ring">
              {t("chat.retry")}
            </button>
          </div>
        )}
      </div>

      {/* Composer */}
      <form
        className="flex items-end gap-2 border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          rows={Math.min(4, Math.max(1, draft.split("\n").length))}
          placeholder={t("chat.placeholder")}
          aria-label={t("chat.placeholder")}
          disabled={chat.loading}
          className="max-h-32 min-h-[38px] flex-1 resize-none rounded-ctl border border-line bg-surface px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 transition-colors hover:border-lineStrong focus-ring disabled:opacity-60"
        />
        <Button type="submit" size="sm" className="h-[38px] px-3" disabled={!draft.trim() || chat.loading} aria-label={t("chat.send")} title={t("chat.send")}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
      <p className="border-t border-line bg-surface2/40 px-4 py-1.5 text-[10px] leading-relaxed text-ink-400">{t("chat.disclaimer")}</p>
    </div>
  );
}
