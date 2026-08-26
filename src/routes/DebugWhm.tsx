import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  FormGroup,
  InputGroup,
  Button,
  HTMLSelect,
  Pre,
  H5,
  Intent,
} from "@blueprintjs/core";
import { getDb } from "../lib/db";
import {
  addWhmConnection,
  getConnectionById,
  getResourceForConnection,
} from "../domain/connections";
import {
  testWhmConnection,
  getWhmServerInfo,
  listWhmAccounts,
  suspendWhmAccount,
  unsuspendWhmAccount,
} from "../domain/whm";

export function DebugWhmPage() {
  const [environmentId, setEnvironmentId] = useState("");
  const [host, setHost] = useState("localhost");
  const [port, setPort] = useState("8443");
  const [username, setUsername] = useState("root");
  const [apiToken, setApiToken] = useState("test-token");
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [resourceId, setResourceId] = useState<string | null>(null);
  const [log, setLog] = useState("");

  const environmentsQuery = useQuery({
    queryKey: ["debugEnvironments"],
    queryFn: async () => {
      const db = await getDb();
      return db.select<{ id: string; name: string }[]>(
        "SELECT environment.id, environment.name || ' (' || project.name || ')' as name FROM environment JOIN project ON project.id = environment.project_id ORDER BY environment.name",
      );
    },
  });

  function appendLog(label: string, value: unknown) {
    setLog(
      (prev) =>
        `${prev}\n\n--- ${label} ---\n${JSON.stringify(value, null, 2)}`,
    );
  }

  async function handleCreate() {
    if (!environmentId) return appendLog("error", "Pick an environment first");
    const id = await addWhmConnection(environmentId, host, Number(port), {
      mode: "new",
      username,
      apiToken,
    });
    setConnectionId(id);
    const resource = await getResourceForConnection(id);
    setResourceId(resource?.id ?? null);
    appendLog("created connection", { id, resourceId: resource?.id });
  }

  async function handleTest() {
    if (!connectionId || !resourceId)
      return appendLog("error", "Create a connection first");
    const connection = await getConnectionById(connectionId);
    if (!connection) return;
    try {
      appendLog(
        "test success",
        await testWhmConnection(connection, resourceId),
      );
    } catch (err) {
      appendLog("test failed", String(err));
    }
  }

  async function handleInfo() {
    if (!connectionId) return appendLog("error", "Create a connection first");
    const connection = await getConnectionById(connectionId);
    if (!connection) return;
    try {
      appendLog("server info", await getWhmServerInfo(connection));
    } catch (err) {
      appendLog("server info failed", String(err));
    }
  }

  async function handleList() {
    if (!connectionId) return appendLog("error", "Create a connection first");
    const connection = await getConnectionById(connectionId);
    if (!connection) return;
    try {
      appendLog("accounts", await listWhmAccounts(connection));
    } catch (err) {
      appendLog("list failed", String(err));
    }
  }

  async function handleSuspend(user: string, suspend: boolean) {
    if (!connectionId || !resourceId)
      return appendLog("error", "Create a connection first");
    const connection = await getConnectionById(connectionId);
    if (!connection) return;
    try {
      if (suspend)
        await suspendWhmAccount(connection, resourceId, user, "debug test");
      else await unsuspendWhmAccount(connection, resourceId, user);
      appendLog(
        `${suspend ? "suspend" : "unsuspend"} ${user}`,
        "ok — re-run List accounts to confirm",
      );
    } catch (err) {
      appendLog(
        `${suspend ? "suspend" : "unsuspend"} ${user} failed`,
        String(err),
      );
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 700 }}>
      <H5>
        WHM connector debug harness (temporary — delete once real UI ships)
      </H5>

      <Card style={{ marginBottom: 12 }}>
        <FormGroup label="Environment">
          <HTMLSelect
            fill
            value={environmentId}
            onChange={(e) => setEnvironmentId(e.currentTarget.value)}
            options={[
              { label: "Select…", value: "" },
              ...(environmentsQuery.data ?? []).map((e) => ({
                label: e.name,
                value: e.id,
              })),
            ]}
          />
        </FormGroup>
        <FormGroup label="Host">
          <InputGroup
            value={host}
            onChange={(e) => setHost(e.currentTarget.value)}
          />
        </FormGroup>
        <FormGroup label="Port">
          <InputGroup
            value={port}
            onChange={(e) => setPort(e.currentTarget.value)}
          />
        </FormGroup>
        <FormGroup label="Username">
          <InputGroup
            value={username}
            onChange={(e) => setUsername(e.currentTarget.value)}
          />
        </FormGroup>
        <FormGroup label="API token">
          <InputGroup
            value={apiToken}
            onChange={(e) => setApiToken(e.currentTarget.value)}
          />
        </FormGroup>
        <Button
          text="Create WHM connection"
          onClick={handleCreate}
          intent={Intent.PRIMARY}
        />
        {connectionId && (
          <div style={{ marginTop: 8, fontSize: 12 }}>
            connectionId: {connectionId}
          </div>
        )}
      </Card>

      <Card
        style={{ marginBottom: 12, display: "flex", gap: 8, flexWrap: "wrap" }}
      >
        <Button
          text="Test connection"
          onClick={handleTest}
          disabled={!connectionId}
        />
        <Button
          text="Get server info"
          onClick={handleInfo}
          disabled={!connectionId}
        />
        <Button
          text="List accounts"
          onClick={handleList}
          disabled={!connectionId}
        />
        <Button
          text="Suspend oldclient"
          onClick={() => handleSuspend("oldclient", true)}
          disabled={!connectionId}
        />
        <Button
          text="Unsuspend oldclient"
          onClick={() => handleSuspend("oldclient", false)}
          disabled={!connectionId}
        />
        <Button
          text="Suspend acme"
          onClick={() => handleSuspend("acme", true)}
          disabled={!connectionId}
        />
        <Button
          text="Unsuspend acme"
          onClick={() => handleSuspend("acme", false)}
          disabled={!connectionId}
        />
      </Card>

      <Pre style={{ whiteSpace: "pre-wrap", maxHeight: 400, overflow: "auto" }}>
        {log || "(no output yet)"}
      </Pre>
    </div>
  );
}
