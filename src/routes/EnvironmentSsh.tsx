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
  TextArea,
  Button,
  ButtonGroup,
  HTMLTable,
  Spinner,
  NonIdealState,
  HTMLSelect,
} from "@blueprintjs/core";
import {
  CredentialSummary,
  listCredentials,
  type SshCredentialKind,
} from "../domain/credentials";
import { listConnections, addSshConnection } from "../domain/connections";
import { queryKeys } from "../domain/queryKeys";
import { showError, showSuccess } from "../lib/toaster";
import { describeError } from "../lib/errors";
import { StickySubHeader } from "../components/StickySubHeader";
import { SplitPane } from "../components/layout/SplitPane";

export function EnvironmentSshPage() {
  const { environmentId = "" } = useParams<{ environmentId: string }>();
  const queryClient = useQueryClient();

  const connectionsQuery = useQuery({
    queryKey: queryKeys.connections(environmentId),
    queryFn: () => listConnections(environmentId),
    enabled: !!environmentId,
  });
  const sshConnections = (connectionsQuery.data ?? []).filter(
    (c) => c.kind === "ssh",
  );

  const credentialsQuery = useQuery({
    queryKey: queryKeys.credentials(),
    queryFn: listCredentials,
  });

  const addServerMutation = useMutation({
    mutationFn: (input: {
      host: string;
      port: number;
      credential: Parameters<typeof addSshConnection>[3];
    }) =>
      addSshConnection(environmentId, input.host, input.port, input.credential),
    onSuccess: () => {
      showSuccess("Server added");
      queryClient.invalidateQueries({
        queryKey: queryKeys.connections(environmentId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.credentials() });
    },
    onError: (err) => showError(`Failed to add server: ${describeError(err)}`),
  });

  return (
    <div>
      <StickySubHeader title="SSH Servers" />

      <SplitPane
        left={
          <Card>
            {connectionsQuery.isLoading && <Spinner size={20} />}
            {connectionsQuery.data && sshConnections.length === 0 && (
              <NonIdealState
                icon="offline"
                title="No servers yet"
                description="Add one on the right to get started."
              />
            )}
            {sshConnections.length > 0 && (
              <HTMLTable compact interactive style={{ width: "100%" }}>
                <thead>
                  <tr>
                    <th>Host</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sshConnections.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <Link
                          to={`/connections/${c.id}`}
                          style={{ color: "inherit" }}
                        >
                          {c.host}:{c.port}
                        </Link>
                      </td>
                      <td>
                        <Tag
                          intent={
                            c.last_verified_at ? Intent.SUCCESS : Intent.WARNING
                          }
                          minimal
                        >
                          {c.last_verified_at ? "verified" : "unverified"}
                        </Tag>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <Link to={`/connections/${c.id}`}>
                          <Button size="small" text="View" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </HTMLTable>
            )}
          </Card>
        }
        right={
          <Card>
            <H5>Add server</H5>
            <AddServerForm
              credentials={credentialsQuery.data ?? []}
              onSubmit={(input) => addServerMutation.mutate(input)}
              loading={addServerMutation.isPending}
            />
          </Card>
        }
      />
    </div>
  );
}

function AddServerForm({
  credentials,
  onSubmit,
  loading,
}: {
  credentials: CredentialSummary[];
  onSubmit: (input: { host: string; port: number; credential: any }) => void;
  loading: boolean;
}) {
  const [host, setHost] = useState("");
  const [port, setPort] = useState("22");
  const [credentialMode, setCredentialMode] = useState<"new" | "existing">(
    credentials.length > 0 ? "existing" : "new",
  );
  const [selectedCredentialId, setSelectedCredentialId] = useState(
    credentials[0]?.id ?? "",
  );
  const [username, setUsername] = useState("");
  useEffect(() => {
    // credentials can change under this form (e.g. a credential was deleted
    // elsewhere and the cache just refreshed) — never submit a selection that
    // no longer exists.
    if (credentials.length === 0) {
      setCredentialMode("new");
      setSelectedCredentialId("");
    } else if (!credentials.some((c) => c.id === selectedCredentialId)) {
      setSelectedCredentialId(credentials[0].id);
    }
  }, [credentials]);
  const [authKind, setAuthKind] = useState<SshCredentialKind>("ssh_password");
  const [secret, setSecret] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [attempted, setAttempted] = useState(false);

  const trimmedHost = host.trim();
  const portNumber = Number(port);
  const isPortValid =
    Number.isInteger(portNumber) && portNumber >= 1 && portNumber <= 65535;
  const trimmedUsername = username.trim();
  const trimmedSecret = secret.trim();

  const isCredentialValid =
    credentialMode === "existing"
      ? !!selectedCredentialId
      : trimmedUsername.length > 0 && trimmedSecret.length > 0;

  const isFormValid =
    trimmedHost.length > 0 && isPortValid && isCredentialValid;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setAttempted(true);
        if (!isFormValid) return;

        const credential =
          credentialMode === "existing"
            ? { mode: "existing" as const, credentialId: selectedCredentialId }
            : {
                mode: "new" as const,
                authKind,
                username: trimmedUsername,
                secret: trimmedSecret,
                passphrase:
                  authKind === "ssh_private_key" ? passphrase : undefined,
              };
        onSubmit({ host: trimmedHost, port: portNumber, credential });
        setAttempted(false);
        setHost("");
        setUsername("");
        setSecret("");
        setPassphrase("");
      }}
    >
      <FormGroup
        label="Host"
        intent={attempted && !trimmedHost ? Intent.DANGER : Intent.NONE}
        helperText={attempted && !trimmedHost ? "Host is required." : undefined}
      >
        <InputGroup
          value={host}
          intent={attempted && !trimmedHost ? Intent.DANGER : Intent.NONE}
          onChange={(e) => setHost(e.currentTarget.value)}
        />
      </FormGroup>
      <FormGroup
        label="Port"
        intent={attempted && !isPortValid ? Intent.DANGER : Intent.NONE}
        helperText={
          attempted && !isPortValid
            ? "Enter a port between 1 and 65535."
            : undefined
        }
      >
        <InputGroup
          value={port}
          intent={attempted && !isPortValid ? Intent.DANGER : Intent.NONE}
          onChange={(e) => setPort(e.currentTarget.value)}
        />
      </FormGroup>

      {credentials.length > 0 && (
        <FormGroup label="Credential">
          <ButtonGroup fill style={{ marginBottom: 8 }}>
            <Button
              text="Use existing"
              active={credentialMode === "existing"}
              onClick={() => setCredentialMode("existing")}
            />
            <Button
              text="New credential"
              active={credentialMode === "new"}
              onClick={() => setCredentialMode("new")}
            />
          </ButtonGroup>
        </FormGroup>
      )}

      {credentialMode === "existing" && credentials.length > 0 ? (
        <FormGroup label="Saved credential">
          <HTMLSelect
            fill
            value={selectedCredentialId}
            onChange={(e) => setSelectedCredentialId(e.currentTarget.value)}
            options={credentials.map((c) => ({
              label: `${c.label} (${c.kind})`,
              value: c.id,
            }))}
          />
        </FormGroup>
      ) : (
        <>
          <FormGroup
            label="Username"
            intent={attempted && !trimmedUsername ? Intent.DANGER : Intent.NONE}
            helperText={
              attempted && !trimmedUsername
                ? "Username is required."
                : undefined
            }
          >
            <InputGroup
              value={username}
              intent={
                attempted && !trimmedUsername ? Intent.DANGER : Intent.NONE
              }
              onChange={(e) => setUsername(e.currentTarget.value)}
            />
          </FormGroup>

          <FormGroup label="Authentication">
            <ButtonGroup fill>
              <Button
                text="Password"
                active={authKind === "ssh_password"}
                onClick={() => setAuthKind("ssh_password")}
              />
              <Button
                text="Private key"
                active={authKind === "ssh_private_key"}
                onClick={() => setAuthKind("ssh_private_key")}
              />
            </ButtonGroup>
          </FormGroup>
          {authKind === "ssh_password" ? (
            <FormGroup
              label="Password"
              intent={attempted && !trimmedSecret ? Intent.DANGER : Intent.NONE}
              helperText={
                attempted && !trimmedSecret
                  ? "Password is required."
                  : undefined
              }
            >
              <InputGroup
                type="password"
                value={secret}
                intent={
                  attempted && !trimmedSecret ? Intent.DANGER : Intent.NONE
                }
                onChange={(e) => setSecret(e.currentTarget.value)}
              />
            </FormGroup>
          ) : (
            <>
              <FormGroup
                label="Private key"
                helperText={
                  attempted && !trimmedSecret
                    ? "Private key content is required."
                    : "Paste the PEM-format key content."
                }
                intent={
                  attempted && !trimmedSecret ? Intent.DANGER : Intent.NONE
                }
              >
                <TextArea
                  value={secret}
                  onChange={(e) => setSecret(e.currentTarget.value)}
                  fill
                  intent={
                    attempted && !trimmedSecret ? Intent.DANGER : Intent.NONE
                  }
                  style={{
                    fontFamily: "monospace",
                    fontSize: 12,
                    minHeight: 120,
                  }}
                />
              </FormGroup>

              <FormGroup
                label="Passphrase"
                helperText="Leave blank if the key isn't passphrase-protected."
              >
                <InputGroup
                  type="password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.currentTarget.value)}
                />
              </FormGroup>
            </>
          )}
        </>
      )}

      <Button
        type="submit"
        text="Add server"
        fill
        intent={Intent.PRIMARY}
        loading={loading}
        disabled={attempted && !isFormValid}
        style={{ marginTop: 8 }}
      />
    </form>
  );
}
