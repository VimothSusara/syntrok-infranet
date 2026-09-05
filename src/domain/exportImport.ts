import { listProjects, createProject } from "./projects";
import { listEnvironments, createEnvironment } from "./environments";
import { listConnections, addSshConnection, addWhmConnection, addCpanelConnection } from "./connections";
import { listCredentials, getCredentialSecret, restoreCredential, type CredentialKind } from "./credentials";
import type { ConnectionKind } from "./types";

export const EXPORT_FORMAT = "syntrok-infranet-export";
export const EXPORT_VERSION = 1;

interface EncryptedSecret {
    iv: string; // base64
    ciphertext: string; // base64
}

export interface WorkspaceExportCredential {
    kind: CredentialKind;
    label: string;
    username: string;
    // The already-final stored-secret string (round-tripped opaquely, see
    // restoreCredential), plaintext if unencrypted, {iv, ciphertext} if
    // encrypted, or null when secrets weren't included in this export.
    secret: string | EncryptedSecret | null;
}

export interface WorkspaceExportConnection {
    kind: ConnectionKind;
    host: string;
    port: number;
    credential: WorkspaceExportCredential;
}

export interface WorkspaceExportEnvironment {
    name: string;
    connections: WorkspaceExportConnection[];
}

export interface WorkspaceExportProject {
    name: string;
    environments: WorkspaceExportEnvironment[];
}

export interface WorkspaceExport {
    format: typeof EXPORT_FORMAT;
    version: typeof EXPORT_VERSION;
    exportedAt: string;
    includesSecrets: boolean;
    encryption: { kdf: "PBKDF2"; hash: "SHA-256"; iterations: number; salt: string } | null;
    projects: WorkspaceExportProject[];
}

// OWASP's current recommended floor for PBKDF2-SHA256.
const PBKDF2_ITERATIONS = 600_000;

function toBase64(bytes: Uint8Array): string {
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
    const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, [
        "deriveKey",
    ]);
    return crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
    );
}

// A fresh random IV per secret — never reuse an IV with the same derived
// key. The rest of the export (hosts, labels, project/environment names)
// deliberately stays plain JSON even when this is used, so a backup's
// contents can be sanity-checked without the passphrase; only the actual
// secret values are ciphertext.
async function encryptSecret(key: CryptoKey, plaintext: string): Promise<EncryptedSecret> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
    return { iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)) };
}

// GCM is authenticated — a wrong passphrase (wrong derived key) makes
// this throw cleanly rather than silently returning garbage.
async function decryptSecret(key: CryptoKey, payload: EncryptedSecret): Promise<string> {
    const iv = fromBase64(payload.iv);
    const ciphertext = fromBase64(payload.ciphertext);
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, ciphertext as BufferSource);
    return new TextDecoder().decode(plaintext);
}

export async function exportWorkspace(
    workspaceId: string,
    options: { includeSecrets: boolean; passphrase?: string },
): Promise<WorkspaceExport> {
    if (options.includeSecrets && !options.passphrase) {
        throw new Error("A passphrase is required to include credentials.");
    }

    const credentialById = new Map((await listCredentials()).map((c) => [c.id, c]));

    let key: CryptoKey | null = null;
    let salt: Uint8Array | null = null;
    if (options.includeSecrets && options.passphrase) {
        salt = crypto.getRandomValues(new Uint8Array(16));
        key = await deriveKey(options.passphrase, salt, PBKDF2_ITERATIONS);
    }

    const exportedProjects: WorkspaceExportProject[] = [];
    for (const project of await listProjects(workspaceId)) {
        const exportedEnvironments: WorkspaceExportEnvironment[] = [];
        for (const environment of await listEnvironments(project.id)) {
            const exportedConnections: WorkspaceExportConnection[] = [];
            for (const connection of await listConnections(environment.id)) {
                const credential = credentialById.get(connection.credential_id);
                if (!credential) continue; // shouldn't happen (FK-enforced), skip defensively rather than crash the export

                let secret: WorkspaceExportCredential["secret"] = null;
                if (options.includeSecrets) {
                    const rawSecret = await getCredentialSecret(connection.credential_id);
                    secret = key ? await encryptSecret(key, rawSecret) : rawSecret;
                }

                exportedConnections.push({
                    kind: connection.kind,
                    host: connection.host,
                    port: connection.port,
                    credential: { kind: credential.kind, label: credential.label, username: credential.username, secret },
                });
            }
            exportedEnvironments.push({ name: environment.name, connections: exportedConnections });
        }
        exportedProjects.push({ name: project.name, environments: exportedEnvironments });
    }

    return {
        format: EXPORT_FORMAT,
        version: EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        includesSecrets: options.includeSecrets,
        encryption: salt ? { kdf: "PBKDF2", hash: "SHA-256", iterations: PBKDF2_ITERATIONS, salt: toBase64(salt) } : null,
        projects: exportedProjects,
    };
}

export interface ImportResult {
    projects: number;
    connections: number;
    failures: string[];
}

// Additive only — every imported project/environment/connection gets a
// fresh id, never merged with or overwritten onto existing data. A
// project name collision (the only unique constraint reachable here,
// since environments/connections are created under brand-new parents)
// is resolved by auto-suffixing rather than failing the whole import.
// One failed connection doesn't abort the rest — failures are collected
// and returned alongside the counts that did succeed.
export async function importWorkspace(
    workspaceId: string,
    data: WorkspaceExport,
    passphrase?: string,
): Promise<ImportResult> {
    if (data.format !== EXPORT_FORMAT) {
        throw new Error("This file is not a Syntrok InfraNet workspace export.");
    }
    if (data.version !== EXPORT_VERSION) {
        throw new Error(`Unsupported export version: ${data.version}`);
    }

    let key: CryptoKey | null = null;
    if (data.encryption) {
        if (!passphrase) throw new Error("This export is encrypted — a passphrase is required.");
        key = await deriveKey(passphrase, fromBase64(data.encryption.salt), data.encryption.iterations);
    }

    const existingProjectNames = new Set((await listProjects(workspaceId)).map((p) => p.name));
    const failures: string[] = [];
    let projectCount = 0;
    let connectionCount = 0;

    for (const project of data.projects) {
        let name = project.name;
        for (let suffix = 2; existingProjectNames.has(name); suffix++) {
            name = `${project.name} (${suffix})`;
        }
        existingProjectNames.add(name);

        try {
            const projectId = await createProject(workspaceId, name);
            projectCount++;

            for (const environment of project.environments) {
                const environmentId = await createEnvironment(projectId, environment.name);

                for (const connection of environment.connections) {
                    const label = `${connection.host} (${name}/${environment.name})`;
                    try {
                        let storedSecret = "";
                        if (connection.credential.secret !== null) {
                            storedSecret =
                                typeof connection.credential.secret === "string"
                                    ? connection.credential.secret
                                    : await decryptSecret(key!, connection.credential.secret);
                        }

                        const credentialId = await restoreCredential(
                            connection.credential.kind,
                            connection.credential.label,
                            connection.credential.username,
                            storedSecret,
                        );

                        const credentialInput = { mode: "existing" as const, credentialId };
                        if (connection.kind === "ssh") {
                            await addSshConnection(environmentId, connection.host, connection.port, credentialInput);
                        } else if (connection.kind === "whm") {
                            await addWhmConnection(environmentId, connection.host, connection.port, credentialInput);
                        } else {
                            await addCpanelConnection(environmentId, connection.host, connection.port, credentialInput);
                        }
                        connectionCount++;
                    } catch (err) {
                        failures.push(`${label}: ${String(err)}`);
                    }
                }
            }
        } catch (err) {
            failures.push(`Project "${name}": ${String(err)}`);
        }
    }

    return { projects: projectCount, connections: connectionCount, failures };
}
