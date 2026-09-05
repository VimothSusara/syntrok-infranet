import {
  Card,
  H5,
  Button,
  ButtonGroup,
  ProgressBar,
  Intent,
  Classes,
  Alert,
  Dialog,
  Checkbox,
  Callout,
  FormGroup,
  InputGroup,
} from "@blueprintjs/core";
import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { save, open } from "@tauri-apps/plugin-dialog";
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";
import { getVersion } from "@tauri-apps/api/app";
import { formatBytes } from "../lib/format";
import { showSuccess, showError } from "../lib/toaster";
import { describeError } from "../lib/errors";
import { useThemePreference } from "../lib/theme";
import { APP_NAME } from "../lib/constants";
import { PageHeader } from "../components/PageHeader";
import { PasswordField } from "../components/PasswordField";
import { backupDatabase, restoreDatabase } from "../domain/backup";
import { exportWorkspace, importWorkspace, type WorkspaceExport } from "../domain/exportImport";
import type { LayoutContext } from "../layouts/AppLayout";

export function SettingsPage() {
  const { workspaceId } = useOutletContext<LayoutContext>();
  const queryClient = useQueryClient();
  const [preference, setPreference] = useThemePreference();
  const [progress, setProgress] = useState<{
    downloaded: number;
    total: number;
  } | null>(null);
  const [restoreSource, setRestoreSource] = useState<string | null>(null);

  const [exportOpen, setExportOpen] = useState(false);
  const [includeSecrets, setIncludeSecrets] = useState(false);
  const [exportPassphrase, setExportPassphrase] = useState("");
  const [exportPassphraseReady, setExportPassphraseReady] = useState(true);

  const [pendingImport, setPendingImport] = useState<WorkspaceExport | null>(null);
  const [importPassphrase, setImportPassphrase] = useState("");

  const versionQuery = useQuery({
    queryKey: ["appVersion"],
    queryFn: getVersion,
  });

  const backupMutation = useMutation({
    mutationFn: async () => {
      const destination = await save({
        title: "Save backup",
        defaultPath: `infranet-backup-${new Date().toISOString().slice(0, 10)}.db`,
        filters: [{ name: "Database", extensions: ["db"] }],
      });
      if (!destination) return false;
      await backupDatabase(destination);
      return true;
    },
    onSuccess: (didSave) => {
      if (didSave) showSuccess("Backup saved");
    },
    onError: (err) => showError(`Backup failed: ${describeError(err)}`),
  });

  const restoreMutation = useMutation({
    mutationFn: async () => {
      if (!restoreSource) throw new Error("Not ready yet");
      await restoreDatabase(restoreSource);
    },
    onSuccess: async () => {
      showSuccess("Restored — restarting…");
      await relaunch();
    },
    onError: (err) => showError(`Restore failed: ${describeError(err)}`),
    onSettled: () => setRestoreSource(null),
  });

  async function pickRestoreFile() {
    const source = await open({
      title: "Choose a backup to restore",
      multiple: false,
      filters: [{ name: "Database", extensions: ["db"] }],
    });
    if (source) setRestoreSource(source);
  }

  const exportMutation = useMutation({
    mutationFn: async () => {
      const data = await exportWorkspace(workspaceId, {
        includeSecrets,
        passphrase: includeSecrets ? exportPassphrase : undefined,
      });
      const destination = await save({
        title: "Save workspace export",
        defaultPath: `infranet-export-${new Date().toISOString().slice(0, 10)}.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!destination) return false;
      await writeTextFile(destination, JSON.stringify(data, null, 2));
      return true;
    },
    onSuccess: (didSave) => {
      if (didSave) showSuccess("Workspace exported");
    },
    onError: (err) => showError(`Export failed: ${describeError(err)}`),
    onSettled: () => {
      setExportOpen(false);
      setIncludeSecrets(false);
      setExportPassphrase("");
      setExportPassphraseReady(true);
    },
  });

  async function pickImportFile() {
    const source = await open({
      title: "Choose a workspace export",
      multiple: false,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!source) return;
    try {
      const text = await readTextFile(source);
      const data = JSON.parse(text) as WorkspaceExport;
      if (data.format !== "syntrok-infranet-export") {
        showError("This file is not a Syntrok InfraNet workspace export.");
        return;
      }
      setPendingImport(data);
    } catch (err) {
      showError(`Could not read that file: ${describeError(err)}`);
    }
  }

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!pendingImport) throw new Error("Not ready yet");
      return importWorkspace(workspaceId, pendingImport, pendingImport.encryption ? importPassphrase : undefined);
    },
    onSuccess: (result) => {
      const summary = `Imported ${result.projects} project${result.projects === 1 ? "" : "s"}, ${result.connections} connection${result.connections === 1 ? "" : "s"}`;
      if (result.failures.length > 0) {
        showError(`${summary} — ${result.failures.length} failed: ${result.failures.join("; ")}`);
      } else {
        showSuccess(summary);
      }
      queryClient.invalidateQueries();
    },
    onError: (err) => showError(`Import failed: ${describeError(err)}`),
    onSettled: () => {
      setPendingImport(null);
      setImportPassphrase("");
    },
  });

  const checkUpdateMutation = useMutation({
    mutationFn: async () => {
      const update = await check();
      if (!update) return null;

      let downloaded = 0;
      let total = 0;

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            total = event.data.contentLength ?? 0;
            setProgress({ downloaded: 0, total });
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            setProgress({ downloaded, total });
            break;
          case "Finished":
            setProgress(null);
            break;
        }
      });

      return update;
    },
    onSuccess: async (update) => {
      if (!update) {
        showSuccess("You're up to date");
      } else {
        showSuccess(`Updated to ${update.version} — restarting…`);
        await relaunch();
      }
    },
    onError: (err) => {
      setProgress(null);
      showError(`Update check failed: ${describeError(err)}`);
    },
  });

  return (
    <div style={{ maxWidth: 520 }}>
      <PageHeader title="Settings" />

      <Card style={{ marginBottom: 14 }}>
        <H5>Appearance</H5>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ fontSize: 13, opacity: 0.8 }}>Theme</div>
          <ButtonGroup>
            {(["system", "light", "dark"] as const).map((option) => (
              <Button
                key={option}
                text={option[0].toUpperCase() + option.slice(1)}
                active={preference === option}
                onClick={() => setPreference(option)}
              />
            ))}
          </ButtonGroup>
        </div>
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <H5>Updates</H5>
        <div
          className={Classes.TEXT_MUTED}
          style={{ fontSize: 13, marginBottom: 10 }}
        >
          Current version: v{versionQuery.data ?? "…"}
        </div>

        {progress ? (
          <div style={{ marginBottom: 10 }}>
            {progress.total > 0 ? (
              <>
                <ProgressBar
                  value={progress.downloaded / progress.total}
                  intent={Intent.PRIMARY}
                  animate={false}
                />
                <div
                  className={Classes.TEXT_MUTED}
                  style={{ fontSize: 12, marginTop: 6 }}
                >
                  {formatBytes(progress.downloaded)} of{" "}
                  {formatBytes(progress.total)}
                </div>
              </>
            ) : (
              <>
                <ProgressBar intent={Intent.PRIMARY} />
                <div
                  className={Classes.TEXT_MUTED}
                  style={{ fontSize: 12, marginTop: 6 }}
                >
                  {formatBytes(progress.downloaded)} downloaded
                </div>
              </>
            )}
          </div>
        ) : (
          <Button
            size="small"
            text="Check for updates"
            loading={checkUpdateMutation.isPending}
            onClick={() => checkUpdateMutation.mutate()}
          />
        )}
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <H5>Backup</H5>
        <div
          className={Classes.TEXT_MUTED}
          style={{ fontSize: 13, marginBottom: 10 }}
        >
          A full, same-machine snapshot of your workspace — projects, environments, and connections. Restoring
          replaces all current data and restarts the app.
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button
            size="small"
            text="Create backup now"
            loading={backupMutation.isPending}
            onClick={() => backupMutation.mutate()}
          />
          <Button size="small" text="Restore from backup…" onClick={pickRestoreFile} />
        </div>
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <H5>Export / Import</H5>
        <div
          className={Classes.TEXT_MUTED}
          style={{ fontSize: 13, marginBottom: 10 }}
        >
          Move your projects, environments, and connections to another machine, or share a config with a teammate.
          Credentials are never included unless you explicitly choose to, and are always encrypted when they are.
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button size="small" text="Export workspace…" onClick={() => setExportOpen(true)} />
          <Button size="small" text="Import workspace…" onClick={pickImportFile} />
        </div>
      </Card>

      <Card>
        <H5>About</H5>
        <div style={{ fontWeight: 600 }}>{APP_NAME}</div>
        <div className={Classes.TEXT_MUTED} style={{ fontSize: 12 }}>
          Version {versionQuery.data ?? "…"}
        </div>
      </Card>

      <Alert
        isOpen={restoreSource !== null}
        icon="warning-sign"
        intent={Intent.DANGER}
        confirmButtonText="Restore and restart"
        cancelButtonText="Cancel"
        loading={restoreMutation.isPending}
        style={{ width: 480 }}
        onConfirm={() => restoreMutation.mutate()}
        onCancel={() => setRestoreSource(null)}
        canOutsideClickCancel
      >
        <p>
          Restore from <strong>{restoreSource}</strong>? This replaces <strong>all</strong> current projects,
          environments, and connections with what's in this backup, and restarts the app immediately. This cannot
          be undone.
        </p>
      </Alert>

      <Dialog
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Export Workspace"
        style={{ width: 480 }}
      >
        <div style={{ padding: 24 }}>
          <Checkbox
            label="Include credentials"
            checked={includeSecrets}
            onChange={(e) => setIncludeSecrets(e.currentTarget.checked)}
          />
          {includeSecrets && (
            <>
              <Callout intent={Intent.WARNING} icon="warning-sign" style={{ marginBottom: 12 }}>
                This file will contain your server passwords, API tokens, and private keys, encrypted with the
                passphrase below. Anyone with both the file and the passphrase can access your servers — keep it
                as carefully as the credentials themselves.
              </Callout>
              <FormGroup label="Passphrase">
                <PasswordField
                  value={exportPassphrase}
                  onChange={setExportPassphrase}
                  onReadyChange={setExportPassphraseReady}
                />
              </FormGroup>
            </>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
            <Button text="Cancel" onClick={() => setExportOpen(false)} />
            <Button
              text="Export…"
              intent={Intent.PRIMARY}
              loading={exportMutation.isPending}
              disabled={includeSecrets && (!exportPassphrase || !exportPassphraseReady)}
              onClick={() => exportMutation.mutate()}
            />
          </div>
        </div>
      </Dialog>

      <Alert
        isOpen={pendingImport !== null}
        icon="import"
        intent={Intent.PRIMARY}
        confirmButtonText="Import"
        cancelButtonText="Cancel"
        loading={importMutation.isPending}
        style={{ width: 480 }}
        onConfirm={() => {
          if (pendingImport?.encryption && !importPassphrase) {
            showError("Enter the passphrase this export was encrypted with.");
            return;
          }
          importMutation.mutate();
        }}
        onCancel={() => {
          setPendingImport(null);
          setImportPassphrase("");
        }}
        canOutsideClickCancel
      >
        <p>
          Import {pendingImport?.projects.length ?? 0} project(s) from this file? This adds them as new projects —
          it won't overwrite or merge with anything you already have.
        </p>
        {pendingImport?.encryption && (
          <FormGroup label="Passphrase">
            <InputGroup
              type="password"
              value={importPassphrase}
              onChange={(e) => setImportPassphrase(e.currentTarget.value)}
            />
          </FormGroup>
        )}
      </Alert>
    </div>
  );
}
