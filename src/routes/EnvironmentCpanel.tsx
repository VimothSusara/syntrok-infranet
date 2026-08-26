import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  H5,
  Tag,
  Intent,
  FormGroup,
  InputGroup,
  Button,
  ButtonGroup,
  HTMLTable,
  Spinner,
  NonIdealState,
  HTMLSelect,
} from "@blueprintjs/core";
import { listCredentials, type CredentialSummary } from "../domain/credentials";
import { listConnections, addCpanelConnection, type CpanelCredentialInput } from "../domain/connections";
import { queryKeys } from "../domain/queryKeys";
import { showError, showSuccess } from "../lib/toaster";
import { describeError } from "../lib/errors";
import { StickySubHeader } from "../components/StickySubHeader";

export function EnvironmentCpanelPage() {
  const { environmentId = "" } = useParams<{ environmentId: string }>();
  const queryClient = useQueryClient();

  const connectionsQuery = useQuery({
    queryKey: queryKeys.connections(environmentId),
    queryFn: () => listConnections(environmentId),
    enabled: !!environmentId,
  });
  const cpanelConnections = (connectionsQuery.data ?? []).filter((c) => c.kind === "cpanel");

  const credentialsQuery = useQuery({
    queryKey: queryKeys.credentials(),
    queryFn: listCredentials,
  });
  const cpanelCredentials = (credentialsQuery.data ?? []).filter((c) => c.kind === "cpanel_api_token");

  const addConnectionMutation = useMutation({
    mutationFn: (input: { host: string; port: number; credential: CpanelCredentialInput }) =>
      addCpanelConnection(environmentId, input.host, input.port, input.credential),
    onSuccess: () => {
      showSuccess("cPanel connection added");
      queryClient.invalidateQueries({ queryKey: queryKeys.connections(environmentId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.credentials() });
    },
    onError: (err) => showError(`Failed to add cPanel connection: ${describeError(err)}`),
  });

  return (
    <div>
      <StickySubHeader title="cPanel Accounts" />

      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 16, alignItems: "start" }}>
        <Card>
          {connectionsQuery.isLoading && <Spinner size={20} />}
          {connectionsQuery.data && cpanelConnections.length === 0 && (
            <NonIdealState icon="panel-table" title="No cPanel accounts yet" description="Add one on the right to get started." />
          )}
          {cpanelConnections.length > 0 && (
            <HTMLTable compact interactive style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>Host</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {cpanelConnections.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link to={`/cpanel-connections/${c.id}`} style={{ color: "inherit" }}>
                        {c.host}:{c.port}
                      </Link>
                    </td>
                    <td>
                      <Tag intent={c.last_verified_at ? Intent.SUCCESS : Intent.WARNING} minimal>
                        {c.last_verified_at ? "verified" : "unverified"}
                      </Tag>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Link to={`/cpanel-connections/${c.id}`}>
                        <Button small text="View" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </HTMLTable>
          )}
        </Card>

        <Card>
          <H5>Add cPanel account</H5>
          <AddCpanelConnectionForm
            credentials={cpanelCredentials}
            onSubmit={(input) => addConnectionMutation.mutate(input)}
            loading={addConnectionMutation.isPending}
          />
        </Card>
      </div>
    </div>
  );
}

function AddCpanelConnectionForm({
  credentials,
  onSubmit,
  loading,
}: {
  credentials: CredentialSummary[];
  onSubmit: (input: { host: string; port: number; credential: CpanelCredentialInput }) => void;
  loading: boolean;
}) {
  const [host, setHost] = useState("");
  const [port, setPort] = useState("2083");
  const [credentialMode, setCredentialMode] = useState<"new" | "existing">(credentials.length > 0 ? "existing" : "new");
  const [selectedCredentialId, setSelectedCredentialId] = useState(credentials[0]?.id ?? "");
  const [username, setUsername] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    if (credentials.length === 0) {
      setCredentialMode("new");
      setSelectedCredentialId("");
    } else if (!credentials.some((c) => c.id === selectedCredentialId)) {
      setSelectedCredentialId(credentials[0].id);
    }
  }, [credentials]);

  const trimmedHost = host.trim();
  const portNumber = Number(port);
  const isPortValid = Number.isInteger(portNumber) && portNumber >= 1 && portNumber <= 65535;
  const trimmedUsername = username.trim();
  const trimmedApiToken = apiToken.trim();

  const isCredentialValid =
    credentialMode === "existing" ? !!selectedCredentialId : trimmedUsername.length > 0 && trimmedApiToken.length > 0;

  const isFormValid = trimmedHost.length > 0 && isPortValid && isCredentialValid;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setAttempted(true);
        if (!isFormValid) return;

        const credential: CpanelCredentialInput =
          credentialMode === "existing"
            ? { mode: "existing", credentialId: selectedCredentialId }
            : { mode: "new", username: trimmedUsername, apiToken: trimmedApiToken };

        onSubmit({ host: trimmedHost, port: portNumber, credential });
        setAttempted(false);
        setHost("");
        setUsername("");
        setApiToken("");
      }}
    >
      <FormGroup
        label="Host"
        intent={attempted && !trimmedHost ? Intent.DANGER : Intent.NONE}
        helperText={attempted && !trimmedHost ? "Host is required." : undefined}
      >
        <InputGroup value={host} intent={attempted && !trimmedHost ? Intent.DANGER : Intent.NONE} onChange={(e) => setHost(e.currentTarget.value)} />
      </FormGroup>
      <FormGroup
        label="Port"
        intent={attempted && !isPortValid ? Intent.DANGER : Intent.NONE}
        helperText={attempted && !isPortValid ? "Enter a port between 1 and 65535." : undefined}
      >
        <InputGroup value={port} intent={attempted && !isPortValid ? Intent.DANGER : Intent.NONE} onChange={(e) => setPort(e.currentTarget.value)} />
      </FormGroup>

      {credentials.length > 0 && (
        <FormGroup label="Credential">
          <ButtonGroup fill style={{ marginBottom: 8 }}>
            <Button text="Use existing" active={credentialMode === "existing"} onClick={() => setCredentialMode("existing")} />
            <Button text="New credential" active={credentialMode === "new"} onClick={() => setCredentialMode("new")} />
          </ButtonGroup>
        </FormGroup>
      )}

      {credentialMode === "existing" && credentials.length > 0 ? (
        <FormGroup label="Saved credential">
          <HTMLSelect
            fill
            value={selectedCredentialId}
            onChange={(e) => setSelectedCredentialId(e.currentTarget.value)}
            options={credentials.map((c) => ({ label: c.label, value: c.id }))}
          />
        </FormGroup>
      ) : (
        <>
          <FormGroup
            label="Username"
            intent={attempted && !trimmedUsername ? Intent.DANGER : Intent.NONE}
            helperText={attempted && !trimmedUsername ? "Username is required." : undefined}
          >
            <InputGroup value={username} intent={attempted && !trimmedUsername ? Intent.DANGER : Intent.NONE} onChange={(e) => setUsername(e.currentTarget.value)} />
          </FormGroup>
          <FormGroup
            label="API token"
            intent={attempted && !trimmedApiToken ? Intent.DANGER : Intent.NONE}
            helperText={attempted && !trimmedApiToken ? "API token is required." : undefined}
          >
            <InputGroup type="password" value={apiToken} intent={attempted && !trimmedApiToken ? Intent.DANGER : Intent.NONE} onChange={(e) => setApiToken(e.currentTarget.value)} />
          </FormGroup>
        </>
      )}

      <Button type="submit" text="Add cPanel account" fill intent={Intent.PRIMARY} loading={loading} disabled={attempted && !isFormValid} style={{ marginTop: 8 }} />
    </form>
  );
}
