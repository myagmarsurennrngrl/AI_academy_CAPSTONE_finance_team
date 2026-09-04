"use client";

import * as React from "react";
import { ApiError, fetchChatAnswer } from "@/lib/api";
import type { AppModule, ChatMessage, FilterSpec, Locale } from "@/types";

export interface ChatUiMessage extends ChatMessage {
  id: string;
  /** number of deterministic data queries behind an assistant answer */
  toolCalls?: number;
  mock?: boolean;
}

export interface ChatState {
  messages: ChatUiMessage[];
  loading: boolean;
  /** backend detail text, or the literal "network" */
  error: string | null;
  send: (question: string) => void;
  retry: () => void;
  clear: () => void;
  cancel: () => void;
}

const MAX_HISTORY = 20;
let counter = 0;
const nextId = () => `${Date.now().toString(36)}-${(counter++).toString(36)}`;

/** Conversation with the AI data assistant for one uploaded dataset. The
 *  dashboard's current filter is sent with every question as the default
 *  scope; the backend answers only through deterministic pandas tools. */
export function useChat(uploadId: string, spec: FilterSpec, module: AppModule, locale: Locale): ChatState {
  const [messages, setMessages] = React.useState<ChatUiMessage[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const controllerRef = React.useRef<AbortController | null>(null);

  // Latest scope / language without re-creating the callbacks on every filter change.
  const specRef = React.useRef(spec);
  specRef.current = spec;
  const localeRef = React.useRef(locale);
  localeRef.current = locale;

  React.useEffect(() => {
    return () => controllerRef.current?.abort();
  }, []);

  const ask = React.useCallback(
    async (history: ChatUiMessage[]) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setLoading(true);
      setError(null);
      try {
        const payload = history.slice(-MAX_HISTORY).map(({ role, content }) => ({ role, content }));
        const res = await fetchChatAnswer(
          uploadId,
          { messages: payload, locale: localeRef.current, filters: specRef.current, module },
          controller.signal
        );
        if (controller.signal.aborted) return;
        setMessages((prev) => [
          ...prev,
          { id: nextId(), role: "assistant", content: res.answer, toolCalls: res.tool_calls.length, mock: res.meta.mock_ai },
        ]);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof ApiError ? err.message : "network");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [uploadId, module]
  );

  const send = React.useCallback(
    (question: string) => {
      const content = question.trim();
      if (!content || loading) return;
      const next: ChatUiMessage[] = [...messages, { id: nextId(), role: "user", content }];
      setMessages(next);
      void ask(next);
    },
    [messages, loading, ask]
  );

  const retry = React.useCallback(() => {
    if (loading) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "user") return;
    void ask(messages);
  }, [messages, loading, ask]);

  const cancel = React.useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setLoading(false);
  }, []);

  const clear = React.useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setMessages([]);
    setError(null);
    setLoading(false);
  }, []);

  return { messages, loading, error, send, retry, clear, cancel };
}
