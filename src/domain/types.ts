export interface Workspace {
    id: string;
    name: string;
    created_at: string;
}

export interface Project {
    id: string;
    workspace_id: string;
    name: string;
    created_at: string;
}

export interface Environment {
    id: string;
    project_id: string;
    name: string;
}

export interface Credential {
    id: string;
    kind: 'ssh_password' | 'ssh_private_key';
    label: string;
    username: string;
}

export interface Connection {
    id: string;
    environment_id: string;
    kind: 'ssh';
    host: string;
    port: number;
    credential_id: string;
    last_verified_at: string | null;
    known_host_fingerprint: string | null;
}

export interface Resource {
    id: string;
    connection_id: string;
    kind: 'server';
    label: string;
    metadata: string | null; // JSON string
}

export interface AuditEvent {
    id: string;
    connection_id: string | null;
    resource_id: string | null;
    action: string;
    detail: string | null;
    result: 'success' | 'failure';
    created_at: string;
}

export interface DiscoveredCapabilities {
    systemd: boolean;
    docker: boolean;
    podman: boolean;
    passwordlessSudo: boolean;
}
