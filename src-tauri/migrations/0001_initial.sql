PRAGMA foriegn_keys = ON;

CREATE TABLE connection_kind (
    name TEXT PRIMARY KEY
);
INSERT INTO connection_kind (name) VALUES ('ssh');

CREATE TABLE resource_kind (
    name TEXT PRIMARY KEY
);
INSERT INTO resource_kind (name) VALUES ('server');

CREATE TABLE credential_kind (
    name TEXT PRIMARY KEY
);
INSERT INTO credential_kind (name) VALUES ('ssh_password'), ('ssh_private_key');

-- ── Core entities ──

CREATE TABLE workspace (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE project (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (workspace_id, name)
);

CREATE TABLE environment (
    id         TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,               -- e.g. "production", "staging"
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (project_id, name)
);

CREATE TABLE credential (
    id          TEXT PRIMARY KEY,           -- also the OS-keychain entry name; never store the secret itself here
    kind        TEXT NOT NULL REFERENCES credential_kind(name),
    label       TEXT NOT NULL,              -- user-facing, e.g. "Deploy key (Acme)"
    username    TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE connection (
    id               TEXT PRIMARY KEY,
    environment_id   TEXT NOT NULL REFERENCES environment(id) ON DELETE CASCADE,
    kind             TEXT NOT NULL REFERENCES connection_kind(name),
    host             TEXT NOT NULL,
    port             INTEGER NOT NULL DEFAULT 22,
    credential_id    TEXT NOT NULL REFERENCES credential(id) ON DELETE RESTRICT,
    last_verified_at TEXT,                  -- set on successful "test connection"; NULL = never verified
    created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (environment_id, host, port)
);

CREATE TABLE resource (
    id            TEXT PRIMARY KEY,
    connection_id TEXT NOT NULL REFERENCES connection(id) ON DELETE CASCADE,
    kind          TEXT NOT NULL REFERENCES resource_kind(name),
    label         TEXT NOT NULL,            -- e.g. "nginx", "postgres"
    metadata      TEXT,                     -- JSON blob: cached discovery/capability info
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Append-only audit trail. Deliberately has no updated_at/update trigger — it must never be editable.
CREATE TABLE audit_event (
    id            TEXT PRIMARY KEY,
    connection_id TEXT REFERENCES connection(id) ON DELETE SET NULL,
    resource_id   TEXT REFERENCES resource(id) ON DELETE SET NULL,
    action        TEXT NOT NULL,            -- e.g. "service.restart"
    detail        TEXT,
    result        TEXT NOT NULL CHECK (result IN ('success', 'failure')),
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ── Indexes ──

CREATE INDEX idx_project_workspace     ON project(workspace_id);
CREATE INDEX idx_environment_project   ON environment(project_id);
CREATE INDEX idx_connection_environment ON connection(environment_id);
CREATE INDEX idx_connection_credential ON connection(credential_id);
CREATE INDEX idx_resource_connection   ON resource(connection_id);
CREATE INDEX idx_audit_connection      ON audit_event(connection_id);
CREATE INDEX idx_audit_resource        ON audit_event(resource_id);
CREATE INDEX idx_audit_created_at      ON audit_event(created_at DESC);

-- ── updated_at triggers ──

CREATE TRIGGER trg_workspace_updated_at
AFTER UPDATE ON workspace
BEGIN
    UPDATE workspace SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;

CREATE TRIGGER trg_project_updated_at
AFTER UPDATE ON project
BEGIN
    UPDATE project SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;

CREATE TRIGGER trg_environment_updated_at
AFTER UPDATE ON environment
BEGIN
    UPDATE environment SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;

CREATE TRIGGER trg_credential_updated_at
AFTER UPDATE ON credential
BEGIN
    UPDATE credential SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;

CREATE TRIGGER trg_connection_updated_at
AFTER UPDATE ON connection
BEGIN
    UPDATE connection SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;

CREATE TRIGGER trg_resource_updated_at
AFTER UPDATE ON resource
BEGIN
    UPDATE resource SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;
