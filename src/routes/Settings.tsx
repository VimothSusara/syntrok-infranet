import { H2, H5, Card, Button, ButtonGroup, Classes } from "@blueprintjs/core";
import { useThemePreference } from "../lib/theme";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";
import { useQuery, useMutation } from "@tanstack/react-query";
import { showError, showSuccess } from "../lib/toaster";

const versionQuery = useQuery({
  queryKey: ["appVersion"],
  queryFn: getVersion,
});

const checkUpdateMutation = useMutation({
  mutationFn: async () => {
    const update = await check();
    if (!update) return null;
    await update.downloadAndInstall();
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
  onError: (err) => showError(`Update check failed: ${String(err)}`),
});

export function SettingsPage() {
  const [preference, setPreference] = useThemePreference();

  return (
    <div style={{ maxWidth: 520 }}>
      <H2>Settings</H2>

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
        <Button
          small
          text="Check for updates"
          loading={checkUpdateMutation.isPending}
          onClick={() => checkUpdateMutation.mutate()}
        />
      </Card>

      <Card>
        <H5>About</H5>
        <div style={{ fontWeight: 600 }}>Syntrok InfraNet</div>
        <div style={{ fontSize: 12, opacity: 0.6 }}>Version 0.1.0</div>
      </Card>
    </div>
  );
}
