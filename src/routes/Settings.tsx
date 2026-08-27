import {
  Card,
  H5,
  Button,
  ButtonGroup,
  ProgressBar,
  Intent,
  Classes,
} from "@blueprintjs/core";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";
import { formatBytes } from "../lib/format";
import { showSuccess, showError } from "../lib/toaster";
import { describeError } from "../lib/errors";
import { useThemePreference } from "../lib/theme";
import { APP_NAME } from "../lib/constants";
import { PageHeader } from "../components/PageHeader";

export function SettingsPage() {
  const [preference, setPreference] = useThemePreference();
  const [progress, setProgress] = useState<{
    downloaded: number;
    total: number;
  } | null>(null);

  const versionQuery = useQuery({
    queryKey: ["appVersion"],
    queryFn: getVersion,
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

      <Card>
        <H5>About</H5>
        <div style={{ fontWeight: 600 }}>{APP_NAME}</div>
        <div className={Classes.TEXT_MUTED} style={{ fontSize: 12 }}>
          Version {versionQuery.data ?? "…"}
        </div>
      </Card>
    </div>
  );
}
