import { useState } from "react";
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
import { getProjectById } from "../domain/projects";
import { getEnvironmentById } from "../domain/environments";
import { listConnections, addSshConnection } from "../domain/connections";
import { queryKeys } from "../domain/queryKeys";
import { showError, showSuccess } from "../lib/toaster";
import { PageHeader } from "../components/PageHeader";

export function EnvironmentDetailPage() {
  const { projectId = "", environmentId = "" } = useParams<{
    projectId: string;
    environmentId: string;
  }>();
  const queryClient = useQueryClient();

  const projectQuery = useQuery({
    queryKey: queryKeys.project(projectId),
    queryFn: () => getProjectById(projectId),
    enabled: !!projectId,
  });
  const environmentQuery = useQuery({
    queryKey: queryKeys.environment(environmentId),
    queryFn: () => getEnvironmentById(environmentId),
    enabled: !!environmentId,
  });
  const connectionsQuery = useQuery({
    queryKey: queryKeys.connections(environmentId),
    queryFn: () => listConnections(environmentId),
    enabled: !!environmentId,
  });
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
    onError: (err) => showError(`Failed to add server: ${String(err)}`),
  });

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { text: "Projects", to: "/projects" },
          {
            text: projectQuery.data?.name ?? "…",
            to: `/projects/${projectId}`,
          },
          { text: environmentQuery.data?.name ?? "…" },
        ]}
        title={environmentQuery.data?.name ?? "Environment"}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.6fr 1fr",
          gap: 16,
          marginTop: 20,
          alignItems: "start",
        }}
      >
        <Card>
          <H5>Servers</H5>
          {connectionsQuery.isLoading && <Spinner size={20} />}
          {connectionsQuery.data?.length === 0 && (
            <NonIdealState
              icon="offline"
              title="No servers yet"
              description="Add one on the right to get started."
            />
          )}
          {connectionsQuery.data && connectionsQuery.data.length > 0 && (
            <HTMLTable compact interactive style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>Host</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {connectionsQuery.data.map((c) => (
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
          <H5>Add server</H5>
          <AddServerForm
            credentials={credentialsQuery.data ?? []}
            onSubmit={(input) => addServerMutation.mutate(input)}
            loading={addServerMutation.isPending}
          />
        </Card>
      </div>
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
  const [authKind, setAuthKind] = useState<SshCredentialKind>("ssh_password");
  const [secret, setSecret] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const credential =
          credentialMode === "existing"
            ? { mode: "existing" as const, credentialId: selectedCredentialId }
            : { mode: "new" as const, authKind, username, secret };
        onSubmit({ host, port: Number(port), credential });
        setHost("");
        setUsername("");
        setSecret("");
      }}
    >
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
          <FormGroup label="Username">
            <InputGroup
              value={username}
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
            <FormGroup label="Password">
              <InputGroup
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.currentTarget.value)}
              />
            </FormGroup>
          ) : (
            <FormGroup
              label="Private key"
              helperText="Paste the PEM-format key content. Passphrase-protected keys aren't supported yet."
            >
              <TextArea
                value={secret}
                onChange={(e) => setSecret(e.currentTarget.value)}
                fill
                // growVertically
                style={{
                  fontFamily: "monospace",
                  fontSize: 12,
                  minHeight: 120,
                }}
              />
            </FormGroup>
          )}
        </>
      )}

      <Button
        type="submit"
        text="Add server"
        fill
        intent={Intent.PRIMARY}
        loading={loading}
        style={{ marginTop: 8 }}
      />
    </form>
  );
}
