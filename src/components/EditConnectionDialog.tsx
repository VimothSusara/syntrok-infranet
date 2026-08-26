import { useState, useEffect, type FormEvent } from "react";
import {
  Dialog,
  Classes,
  FormGroup,
  InputGroup,
  TextArea,
  Button,
  ButtonGroup,
  HTMLSelect,
  Intent,
} from "@blueprintjs/core";
import type {
  CredentialSummary,
  SshCredentialKind,
} from "../domain/credentials";
import type {
  CredentialInput,
  WhmCredentialInput,
  CpanelCredentialInput,
} from "../domain/connections";

export type EditConnectionValue =
  | { host: string; port: number; credential: CredentialInput }
  | { host: string; port: number; credential: WhmCredentialInput }
  | { host: string; port: number; credential: CpanelCredentialInput };

export function EditConnectionDialog({
  isOpen,
  kind,
  host: initialHost,
  port: initialPort,
  credentialId: initialCredentialId,
  credentials,
  loading,
  onConfirm,
  onClose,
}: {
  isOpen: boolean;
  kind: "ssh" | "whm" | "cpanel";
  host: string;
  port: number;
  credentialId: string;
  credentials: CredentialSummary[];
  loading: boolean;
  onConfirm: (value: EditConnectionValue) => void;
  onClose: () => void;
}) {
  const [host, setHost] = useState(initialHost);
  const [port, setPort] = useState(String(initialPort));
  const [credentialMode, setCredentialMode] = useState<"existing" | "new">(
    "existing",
  );
  const [selectedCredentialId, setSelectedCredentialId] =
    useState(initialCredentialId);
  const [username, setUsername] = useState("");
  const [authKind, setAuthKind] = useState<SshCredentialKind>("ssh_password");
  const [secret, setSecret] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setHost(initialHost);
      setPort(String(initialPort));
      setCredentialMode("existing");
      setSelectedCredentialId(initialCredentialId);
      setUsername("");
      setAuthKind("ssh_password");
      setSecret("");
      setPassphrase("");
      setApiToken("");
      setAttempted(false);
    }
  }, [isOpen, initialHost, initialPort, initialCredentialId]);

  const filteredCredentials = credentials.filter((c) => {
    if (kind === "ssh")
      return c.kind !== "whm_api_token" && c.kind !== "cpanel_api_token";
    if (kind === "whm") return c.kind === "whm_api_token";
    return c.kind === "cpanel_api_token";
  });

  const trimmedHost = host.trim();
  const portNumber = Number(port);
  const isPortValid =
    Number.isInteger(portNumber) && portNumber >= 1 && portNumber <= 65535;
  const trimmedUsername = username.trim();
  const trimmedSecret = secret.trim();
  const trimmedApiToken = apiToken.trim();

  const isCredentialValid =
    credentialMode === "existing"
      ? !!selectedCredentialId
      : kind === "ssh"
        ? trimmedUsername.length > 0 && trimmedSecret.length > 0
        : trimmedUsername.length > 0 && trimmedApiToken.length > 0;

  const isFormValid =
    trimmedHost.length > 0 && isPortValid && isCredentialValid;

  const willResetVerification =
    trimmedHost !== initialHost ||
    portNumber !== initialPort ||
    credentialMode === "new" ||
    (credentialMode === "existing" &&
      selectedCredentialId !== initialCredentialId);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setAttempted(true);
    if (!isFormValid) return;

    if (kind !== "ssh") {
      const credential: WhmCredentialInput | CpanelCredentialInput =
        credentialMode === "existing"
          ? { mode: "existing", credentialId: selectedCredentialId }
          : {
              mode: "new",
              username: trimmedUsername,
              apiToken: trimmedApiToken,
            };
      onConfirm({ host: trimmedHost, port: portNumber, credential });
      return;
    }

    const credential: CredentialInput =
      credentialMode === "existing"
        ? { mode: "existing", credentialId: selectedCredentialId }
        : {
            mode: "new",
            authKind,
            username: trimmedUsername,
            secret: trimmedSecret,
            passphrase: authKind === "ssh_private_key" ? passphrase : undefined,
          };
    onConfirm({ host: trimmedHost, port: portNumber, credential });
  }

  return (
    <Dialog
      isOpen={isOpen}
      title="Edit connection"
      onClose={onClose}
      canOutsideClickClose={!loading}
    >
      <form onSubmit={handleSubmit}>
        <div className={Classes.DIALOG_BODY}>
          <FormGroup
            label="Host"
            intent={attempted && !trimmedHost ? Intent.DANGER : Intent.NONE}
            helperText={
              attempted && !trimmedHost ? "Host is required." : undefined
            }
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

          {credentialMode === "existing" ? (
            <FormGroup label="Saved credential">
              <HTMLSelect
                fill
                value={selectedCredentialId}
                onChange={(e) => setSelectedCredentialId(e.currentTarget.value)}
                options={filteredCredentials.map((c) => ({
                  label: `${c.label} (${c.kind})`,
                  value: c.id,
                }))}
              />
            </FormGroup>
          ) : kind !== "ssh" ? (
            <>
              <FormGroup
                label="Username"
                intent={
                  attempted && !trimmedUsername ? Intent.DANGER : Intent.NONE
                }
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
              <FormGroup
                label="API token"
                intent={
                  attempted && !trimmedApiToken ? Intent.DANGER : Intent.NONE
                }
                helperText={
                  attempted && !trimmedApiToken
                    ? "API token is required."
                    : undefined
                }
              >
                <InputGroup
                  type="password"
                  value={apiToken}
                  intent={
                    attempted && !trimmedApiToken ? Intent.DANGER : Intent.NONE
                  }
                  onChange={(e) => setApiToken(e.currentTarget.value)}
                />
              </FormGroup>
            </>
          ) : (
            <>
              <FormGroup
                label="Username"
                intent={
                  attempted && !trimmedUsername ? Intent.DANGER : Intent.NONE
                }
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
                  intent={
                    attempted && !trimmedSecret ? Intent.DANGER : Intent.NONE
                  }
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
                        attempted && !trimmedSecret
                          ? Intent.DANGER
                          : Intent.NONE
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

          {willResetVerification && (
            <div
              className={Classes.TEXT_MUTED}
              style={{ fontSize: 12, marginTop: 4 }}
            >
              Changing these settings clears this connection's verified status —
              you'll need to test it again.
            </div>
          )}
        </div>

        <div className={Classes.DIALOG_FOOTER}>
          <div className={Classes.DIALOG_FOOTER_ACTIONS}>
            <Button text="Cancel" onClick={onClose} disabled={loading} />
            <Button
              type="submit"
              text="Save"
              intent={Intent.PRIMARY}
              loading={loading}
              disabled={attempted && !isFormValid}
            />
          </div>
        </div>
      </form>
    </Dialog>
  );
}
