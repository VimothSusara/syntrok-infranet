import { invoke } from "@tauri-apps/api/core";
import { getDb } from "../lib/db";

export type SshCredentialKind = "ssh_password" | "ssh_private_key";

export async function createSshCredential(
    kind: SshCredentialKind,
    label: string,
    username: string,
    secret: string,
): Promise<string> {
    const id = crypto.randomUUID();

    await invoke("keychain_set", { credentialId: id, secret });

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
