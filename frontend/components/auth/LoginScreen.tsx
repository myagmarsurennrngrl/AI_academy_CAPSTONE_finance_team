"use client";

import * as React from "react";
import { AlertTriangle, Eye, EyeOff, LockKeyhole } from "lucide-react";
import { useAuth, type LoginErrorKey } from "@/components/providers/AuthProvider";
import { useLocale } from "@/components/providers/LocaleProvider";
import { Button, Surface } from "@/components/ui/primitives";

export const INPUT_CLASS =
  "h-10 w-full rounded-ctl border border-line bg-surface px-3 text-sm text-ink-900 placeholder:text-ink-400 transition-colors hover:border-lineStrong focus-ring disabled:opacity-50";

export function LoginScreen() {
  const { t } = useLocale();
  const { login, sessionExpired } = useAuth();
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<LoginErrorKey | null>(null);
  const usernameRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => usernameRef.current?.focus(), []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password || busy) return;
    setBusy(true);
    setError(null);
    const result = await login(username, password);
    setBusy(false);
    if (result) {
      setError(result);
      setPassword("");
    }
  };

  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-sm flex-col justify-center py-10">
      <div className="text-center">
        <span className="mx-auto grid h-11 w-11 place-items-center rounded-card bg-ink-900 text-onInk" aria-hidden="true">
          <LockKeyhole className="h-5 w-5" />
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-ink-900">{t("auth.title")}</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-500">{t("auth.lead")}</p>
      </div>

      <Surface className="mt-6" as="section">
        {sessionExpired && (
          <p role="status" className="mb-4 rounded-ctl border border-warning/25 bg-warningSoft px-3 py-2 text-xs text-warning">
            {t("auth.sessionExpired")}
          </p>
        )}
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="login-username" className="mb-1 block text-xs font-medium text-ink-600">
              {t("auth.username")}
            </label>
            <input
              id="login-username"
              ref={usernameRef}
              className={INPUT_CLASS}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={busy}
            />
          </div>
          <div>
            <label htmlFor="login-password" className="mb-1 block text-xs font-medium text-ink-600">
              {t("auth.password")}
            </label>
            <div className="relative">
              <input
                id="login-password"
                className={`${INPUT_CLASS} pr-10`}
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-ink-400 hover:text-ink-700 focus-ring rounded-ctl"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && (
            <p role="alert" className="flex items-start gap-2 rounded-ctl border border-negative/25 bg-negativeSoft px-3 py-2 text-sm text-negative">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {t(error)}
            </p>
          )}

          <Button type="submit" className="w-full" loading={busy} disabled={!username.trim() || !password}>
            {busy ? t("auth.signingIn") : t("auth.signIn")}
          </Button>
        </form>
      </Surface>

      <p className="mt-4 text-center text-xs text-ink-400">{t("auth.noAccount")}</p>
    </div>
  );
}
