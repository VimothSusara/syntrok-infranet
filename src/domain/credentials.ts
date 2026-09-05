import { invoke } from "@tauri-apps/api/core";
import { getDb } from "../lib/db";

export type SshCredentialKind = "ssh_password" | "ssh_private_key";

export type WhmCredentialKind = "whm_api_token";

export type CpanelCredentialKind = "cpanel_api_token";

export type CredentialKind = SshCredentialKind | WhmCredentialKind | CpanelCredentialKind;

export interface CredentialSummary {
    id: string;
    label: string;
    username: string;
    kind: CredentialKind;
}

// Shared tail of every createXCredential function: generate an id, write
// the secret to the OS keychain, then insert the credential row — rolling
// back the keychain entry if the DB insert fails. `storedSecret` is
// exactly what ends up in the keychain (for ssh_private_key this is
// already the {key, passphrase}-JSON-wrapped form), so callers that
// already have a final stored-secret string (e.g. workspace import,
// re-embedding a value read back via getCredentialSecret) can go straight
// through this instead of re-deriving it.
async function insertCredentialRecord(
    id: string,
    kind: CredentialKind,
    label: string,
    username: string,
    storedSecret: string,
): Promise<void> {
    await invoke("keychain_set", { credentialId: id, secret: storedSecret });

    const db = await getDb();
    try {
        await db.execute(
            "INSERT INTO credential (id, kind, label, username) VALUES ($1, $2, $3, $4)",
            [id, kind, label, username],
        );
    } catch (err) {
        await invoke("keychain_delete", { credentialId: id }).catch(() => { });
        throw err;
    }
}

export async function createSshCredential(
    kind: SshCredentialKind,
    label: string,
    username: string,
    secret: string,
    passphrase?: string,
): Promise<string> {
    const id = crypto.randomUUID();
    const storedSecret =
        kind === "ssh_private_key" ? JSON.stringify({ key: secret, passphrase: passphrase ?? "" }) : secret;
    await insertCredentialRecord(id, kind, label, username, storedSecret);
    return id;
}

export async function createWhmCredential(
    label: string,
    username: string,
    apiToken: string,
): Promise<string> {
    const id = crypto.randomUUID();
    await insertCredentialRecord(id, "whm_api_token", label, username, apiToken);
    return id;
}

export async function createCpanelCredential(
    label: string,
    username: string,
    apiToken: string,
): Promise<string> {
    const id = crypto.randomUUID();
    await insertCredentialRecord(id, "cpanel_api_token", label, username, apiToken);
    return id;
}

// Recreates a credential from an already-final stored-secret string —
// e.g. one decrypted from a workspace export, or an empty placeholder for
// a structure-only (no-secrets) import. Used by workspace import instead
// of the createXCredential functions above, since those expect a raw
// secret to (re-)derive the stored form from, not the stored form itself.
export async function restoreCredential(
    kind: CredentialKind,
    label: string,
    username: string,
    storedSecret: string,
): Promise<string> {
    const id = crypto.randomUUID();
    await insertCredentialRecord(id, kind, label, username, storedSecret);
    return id;
}

export async function getCredentialSecret(credentialId: string): Promise<string> {
    return invoke<string>("keychain_get", { credentialId });
}

export async function listCredentials(): Promise<CredentialSummary[]> {
    const db = await getDb();
    return db.select<CredentialSummary[]>("SELECT id, label, username, kind FROM credential ORDER BY label");
}
