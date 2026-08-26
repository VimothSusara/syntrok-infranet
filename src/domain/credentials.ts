import { invoke } from "@tauri-apps/api/core";
import { getDb } from "../lib/db";

export type SshCredentialKind = "ssh_password" | "ssh_private_key";

export type WhmCredentialKind = "whm_api_token";

export type CpanelCredentialKind = "cpanel_api_token";

export interface CredentialSummary {
    id: string;
    label: string;
    username: string;
    kind: SshCredentialKind | WhmCredentialKind | CpanelCredentialKind;
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

    return id;
}

export async function getCredentialSecret(credentialId: string): Promise<string> {
    return invoke<string>("keychain_get", { credentialId });
}

export async function listCredentials(): Promise<CredentialSummary[]> {
    const db = await getDb();
    return db.select<CredentialSummary[]>("SELECT id, label, username, kind FROM credential ORDER BY label");
}


export async function createWhmCredential(
    label: string,
    username: string,
    apiToken: string,
): Promise<string> {
    const id = crypto.randomUUID();

    await invoke("keychain_set", { credentialId: id, secret: apiToken });

    const db = await getDb();
    try {
        await db.execute(
            "INSERT INTO credential (id, kind, label, username) VALUES ($1, 'whm_api_token', $2, $3)",
            [id, label, username],
        );
    } catch (err) {
        await invoke("keychain_delete", { credentialId: id }).catch(() => { });
        throw err;
    }

    return id;
}

export async function createCpanelCredential(
    label: string,
    username: string,
    apiToken: string,
): Promise<string> {
    const id = crypto.randomUUID();

    await invoke("keychain_set", { credentialId: id, secret: apiToken });

    const db = await getDb();
    try {
        await db.execute(
            "INSERT INTO credential (id, kind, label, username) VALUES ($1, 'cpanel_api_token', $2, $3)",
            [id, label, username],
        );
    } catch (err) {
        await invoke("keychain_delete", { credentialId: id }).catch(() => { });
        throw err;
    }

    return id;
}