// Maps a SQLite UNIQUE-constraint column list (as it appears in the raw error
// text) to what actually violated it, in terms the user recognizes.
const UNIQUE_CONSTRAINT_MESSAGES: Record<string, string> = {
    "connection.environment_id, connection.host, connection.port":
        "A server at this host and port already exists in this environment.",
    "project.workspace_id, project.name":
        "A project with this name already exists in this workspace.",
    "environment.project_id, environment.name":
        "An environment with this name already exists in this project.",
};

// Translates a raw error (SQLite constraint text, a Tauri command's Err
// string, etc.) into copy a non-technical user can act on. Falls back to the
// raw message, stripped of driver boilerplate, when nothing specific matches.
export function describeError(err: unknown): string {
    const raw = err instanceof Error ? err.message : String(err);

    const uniqueMatch = raw.match(/UNIQUE constraint failed: (.+)/);
    if (uniqueMatch) {
        return UNIQUE_CONSTRAINT_MESSAGES[uniqueMatch[1]] ?? "This already exists.";
    }

    if (raw.includes("FOREIGN KEY constraint failed")) {
        return "That referenced something that no longer exists — refresh the page and try again.";
    }

    return raw.replace(/^error returned from database:\s*/i, "");
}
