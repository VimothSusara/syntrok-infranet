import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  H2,
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
} from "@blueprintjs/core";
import type { SshCredentialKind } from "../domain/credentials";
import { getProjectById } from "../domain/projects";
import { getEnvironmentById } from "../domain/environments";
import { listConnections, addSshConnection } from "../domain/connections";
import { queryKeys } from "../domain/queryKeys";
import { showError, showSuccess } from "../lib/toaster";

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

  const addServerMutation = useMutation({
    mutationFn: (input: {
      host: string;
      port: number;
      username: string;
      authKind: SshCredentialKind;
      secret: string;
    }) =>
      addSshConnection(
        environmentId,
        input.host,
        input.port,
        input.username,
        input.authKind,
        input.secret,
      ),
    onSuccess: () => {
      showSuccess("Server added");
      queryClient.invalidateQueries({
        queryKey: queryKeys.connections(environmentId),
      });
    },
    onError: (err) => {
      console.error(`Failed to add server: ${String(err)}`);
      showError(`Failed to add server: ${String(err)}`);
    },
  });

  return (
    <div>
      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 10 }}>
        <Link to="/projects">Projects</Link> /{" "}
        <Link to={`/projects/${projectId}`}>
          {projectQuery.data?.name ?? "…"}
        </Link>{" "}
        / {environmentQuery.data?.name ?? "…"}
      </div>
      <H2>{environmentQuery.data?.name ?? "Environment"}</H2>

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
            onSubmit={(input) => addServerMutation.mutate(input)}
            loading={addServerMutation.isPending}
          />
        </Card>
      </div>
    </div>
  );
}

function AddServerForm({
  onSubmit,
  loading,
}: {
  onSubmit: (input: {
    host: string;
    port: number;
    username: string;
    authKind: SshCredentialKind;
    secret: string;
  }) => void;
  loading: boolean;
}) {
  const [host, setHost] = useState("");
  const [port, setPort] = useState("22");
  const [username, setUsername] = useState("");
  const [authKind, setAuthKind] = useState<SshCredentialKind>("ssh_password");
  const [secret, setSecret] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ host, port: Number(port), username, authKind, secret });
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
            style={{ fontFamily: "monospace", fontSize: 12, minHeight: 120 }}
          />
        </FormGroup>
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
