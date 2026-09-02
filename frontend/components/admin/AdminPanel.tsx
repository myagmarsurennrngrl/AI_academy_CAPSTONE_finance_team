"use client";

import * as React from "react";
import { ArrowLeft, KeyRound, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { INPUT_CLASS } from "@/components/auth/LoginScreen";
import { useAuth } from "@/components/providers/AuthProvider";
import { useLocale } from "@/components/providers/LocaleProvider";
import { Badge, Button, Segmented, Spinner, StateBox, Surface, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { ApiError, createUser, deleteUser, listUsers, resetUserPassword, updateUserRole } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { Role, UserPublic } from "@/types";

interface Props {
  onBack: () => void;
}

type Notice = { tone: "positive" | "negative"; text: string } | null;

function errorText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

export function AdminPanel({ onBack }: Props) {
  const { t, locale } = useLocale();
  const { user: me } = useAuth();

  const [users, setUsers] = React.useState<UserPublic[] | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<Notice>(null);

  // create form
  const [newUsername, setNewUsername] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [newRole, setNewRole] = React.useState<Role>("user");
  const [creating, setCreating] = React.useState(false);

  // per-row actions
  const [resetting, setResetting] = React.useState<string | null>(null);
  const [resetValue, setResetValue] = React.useState("");
  const [busyRow, setBusyRow] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoadError(null);
    try {
      setUsers(await listUsers());
    } catch (err) {
      setLoadError(errorText(err, t("auth.error.network")));
    }
  }, [t]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creating) return;
    setCreating(true);
    setNotice(null);
    try {
      const created = await createUser(newUsername.trim(), newPassword, newRole);
      setUsers((list) => (list ? [...list, created] : [created]));
      setNotice({ tone: "positive", text: t("admin.userCreated", { name: created.username }) });
      setNewUsername("");
      setNewPassword("");
      setNewRole("user");
    } catch (err) {
      setNotice({ tone: "negative", text: errorText(err, t("auth.error.generic")) });
    } finally {
      setCreating(false);
    }
  };

  const onReset = async (username: string) => {
    setBusyRow(username);
    setNotice(null);
    try {
      await resetUserPassword(username, resetValue);
      setNotice({ tone: "positive", text: t("admin.passwordUpdated", { name: username }) });
      setResetting(null);
      setResetValue("");
    } catch (err) {
      setNotice({ tone: "negative", text: errorText(err, t("auth.error.generic")) });
    } finally {
      setBusyRow(null);
    }
  };

  const onDelete = async (username: string) => {
    setBusyRow(username);
    setNotice(null);
    try {
      await deleteUser(username);
      setUsers((list) => (list ? list.filter((u) => u.username !== username) : list));
      setNotice({ tone: "positive", text: t("admin.userDeleted", { name: username }) });
    } catch (err) {
      setNotice({ tone: "negative", text: errorText(err, t("auth.error.generic")) });
    } finally {
      setBusyRow(null);
      setConfirmDelete(null);
    }
  };

  const onRole = async (username: string, role: Role) => {
    setBusyRow(username);
    setNotice(null);
    try {
      const updated = await updateUserRole(username, role);
      setUsers((list) => (list ? list.map((u) => (u.username === username ? updated : u)) : list));
    } catch (err) {
      setNotice({ tone: "negative", text: errorText(err, t("auth.error.generic")) });
    } finally {
      setBusyRow(null);
    }
  };

  const roleLabel = (role: Role) => (role === "admin" ? t("auth.role.admin") : t("auth.role.user"));

  return (
    <div className="mx-auto max-w-4xl py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-ink-900">
            <ShieldCheck className="h-5 w-5 text-accent" aria-hidden="true" />
            {t("admin.title")}
          </h1>
          <p className="mt-1 text-sm text-ink-500">{t("admin.lead")}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("admin.back")}
        </Button>
      </div>

      {notice && (
        <p
          role={notice.tone === "negative" ? "alert" : "status"}
          className={
            notice.tone === "negative"
              ? "mt-4 rounded-ctl border border-negative/25 bg-negativeSoft px-3 py-2 text-sm text-negative"
              : "mt-4 rounded-ctl border border-positive/25 bg-positiveSoft px-3 py-2 text-sm text-positive"
          }
        >
          {notice.text}
        </p>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Surface as="section" padded={false}>
          <div className="flex items-center justify-between px-5 pt-5">
            <h2 className="text-[15px] font-semibold text-ink-900">{t("admin.users")}</h2>
            {users && <span className="text-xs tnum text-ink-400">{users.length}</span>}
          </div>
          <div className="mt-3">
            {loadError ? (
              <div className="p-5">
                <StateBox tone="negative" title={t("so.error")} body={loadError} action={<Button variant="secondary" size="sm" onClick={load}>{t("common.retry")}</Button>} />
              </div>
            ) : users === null ? (
              <div className="flex items-center gap-2 px-5 pb-5 text-sm text-ink-500">
                <Spinner className="h-4 w-4 text-accent" /> {t("common.loading")}
              </div>
            ) : (
              <Table dense>
                <THead>
                  <TR>
                    <TH>{t("auth.username")}</TH>
                    <TH>{t("admin.role")}</TH>
                    <TH>{t("admin.created")}</TH>
                    <TH numeric>{t("admin.actions")}</TH>
                  </TR>
                </THead>
                <TBody>
                  {users.map((u) => {
                    const isMe = u.username === me?.username;
                    const busy = busyRow === u.username;
                    return (
                      <React.Fragment key={u.username}>
                        <TR>
                          <TD>
                            <span className="font-medium text-ink-900">{u.username}</span>
                            {isMe && <span className="ml-2 text-[11px] text-ink-400">({t("admin.you")})</span>}
                          </TD>
                          <TD>
                            {isMe ? (
                              <Badge tone="accent">{roleLabel(u.role)}</Badge>
                            ) : (
                              <Segmented
                                ariaLabel={t("admin.role")}
                                value={u.role}
                                onChange={(role: Role) => onRole(u.username, role)}
                                options={[
                                  { value: "user" as Role, label: t("auth.role.user") },
                                  { value: "admin" as Role, label: t("auth.role.admin") },
                                ]}
                              />
                            )}
                          </TD>
                          <TD className="tnum text-ink-500">{formatDate(u.created_at, locale)}</TD>
                          <TD numeric>
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={busy}
                                aria-label={t("admin.resetPassword")}
                                title={t("admin.resetPassword")}
                                onClick={() => {
                                  setResetting(resetting === u.username ? null : u.username);
                                  setResetValue("");
                                  setConfirmDelete(null);
                                }}
                              >
                                <KeyRound className="h-3.5 w-3.5" />
                              </Button>
                              {!isMe && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={busy}
                                  aria-label={t("admin.delete")}
                                  title={t("admin.delete")}
                                  className="hover:text-negative"
                                  onClick={() => {
                                    setConfirmDelete(confirmDelete === u.username ? null : u.username);
                                    setResetting(null);
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </TD>
                        </TR>
                        {resetting === u.username && (
                          <TR className="bg-surface2/60 hover:bg-surface2/60">
                            <TD colSpan={4}>
                              <form
                                className="flex flex-wrap items-end gap-2"
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  void onReset(u.username);
                                }}
                              >
                                <div className="min-w-[220px] flex-1">
                                  <label htmlFor={`reset-${u.username}`} className="mb-1 block text-xs font-medium text-ink-600">
                                    {t("admin.newPassword")} · {u.username}
                                  </label>
                                  <input
                                    id={`reset-${u.username}`}
                                    className={INPUT_CLASS}
                                    type="text"
                                    autoComplete="new-password"
                                    value={resetValue}
                                    onChange={(e) => setResetValue(e.target.value)}
                                    placeholder={t("admin.passwordHint")}
                                  />
                                </div>
                                <Button type="submit" size="sm" loading={busy} disabled={resetValue.length < 6}>
                                  {t("admin.save")}
                                </Button>
                                <Button type="button" variant="secondary" size="sm" onClick={() => setResetting(null)}>
                                  {t("admin.cancel")}
                                </Button>
                              </form>
                            </TD>
                          </TR>
                        )}
                        {confirmDelete === u.username && (
                          <TR className="bg-negativeSoft/40 hover:bg-negativeSoft/40">
                            <TD colSpan={4}>
                              <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-negative">
                                <span>{t("admin.confirmDelete", { name: u.username })}</span>
                                <div className="flex gap-2">
                                  <Button size="sm" loading={busy} className="bg-negative hover:bg-negative/90" onClick={() => onDelete(u.username)}>
                                    {t("admin.delete")}
                                  </Button>
                                  <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(null)}>
                                    {t("admin.cancel")}
                                  </Button>
                                </div>
                              </div>
                            </TD>
                          </TR>
                        )}
                      </React.Fragment>
                    );
                  })}
                  {users.length === 0 && (
                    <TR>
                      <TD colSpan={4} className="py-6 text-center text-ink-400">
                        {t("admin.empty")}
                      </TD>
                    </TR>
                  )}
                </TBody>
              </Table>
            )}
          </div>
        </Surface>

        <Surface as="section">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink-900">
            <UserPlus className="h-4 w-4 text-accent" aria-hidden="true" />
            {t("admin.createTitle")}
          </h2>
          <form onSubmit={onCreate} className="mt-4 space-y-3" noValidate>
            <div>
              <label htmlFor="new-username" className="mb-1 block text-xs font-medium text-ink-600">
                {t("auth.username")}
              </label>
              <input
                id="new-username"
                className={INPUT_CLASS}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder={t("admin.usernameHint")}
              />
            </div>
            <div>
              <label htmlFor="new-password" className="mb-1 block text-xs font-medium text-ink-600">
                {t("auth.password")}
              </label>
              <input
                id="new-password"
                className={INPUT_CLASS}
                type="text"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t("admin.passwordHint")}
              />
            </div>
            <div>
              <span className="mb-1 block text-xs font-medium text-ink-600">{t("admin.role")}</span>
              <Segmented
                ariaLabel={t("admin.role")}
                size="md"
                value={newRole}
                onChange={setNewRole}
                options={[
                  { value: "user" as Role, label: t("auth.role.user") },
                  { value: "admin" as Role, label: t("auth.role.admin") },
                ]}
              />
            </div>
            <Button type="submit" className="w-full" loading={creating} disabled={newUsername.trim().length < 3 || newPassword.length < 6}>
              {t("admin.create")}
            </Button>
            <p className="text-[11px] leading-relaxed text-ink-400">{t("admin.createNote")}</p>
          </form>
        </Surface>
      </div>
    </div>
  );
}
