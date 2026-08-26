import { invoke } from "@tauri-apps/api/core";
import { getDb } from "../lib/db";
import { getCredentialSecret } from "./credentials";
import { recordAudit } from "./audit";
import type { Connection } from "./types";

// UAPI's real response envelope — confirmed against a live cPanel account,
// NOT the same shape as WHM API1's {metadata:{result,reason}}. The success
// indicator is the top-level `status`, and failure reasons live in `errors`
// (an array), not `metadata.reason` (metadata is typically just `{}` or
// pagination info, not an error carrier).
interface CpanelCallResult {
    status: number;
    errors: string[] | null;
    messages: string[] | null;
    warnings: string[] | null;
    metadata: Record<string, unknown>;
    data?: any;
}

function describeApiErrors(result: CpanelCallResult, fallback: string): string {
    return result.errors && result.errors.length > 0 ? result.errors.join("; ") : fallback;
}

export interface CpanelPageParams {
    search: string;
    page: number;
    pageSize: number;
}

export interface CpanelPageResult<T> {
    items: T[];
    totalPages: number;
    totalCount: number;
}

// Translates the generic {search, page, pageSize} shape used by
// useServerPaginatedList into UAPI's own documented query params
// (api.filter_*/api.paginate_*, per api.docs.cpanel.net/cpanel/filters and
// /cpanel/paginate) — this mapping is specific to cPanel's UAPI and has no
// bearing on how any other connector (e.g. WHM API1) would do the same.
function buildListQuery(filterColumn: string, params: CpanelPageParams): Record<string, string> {
    const query: Record<string, string> = {
        "api.paginate": "1",
        "api.paginate_page": String(params.page),
        "api.paginate_size": String(params.pageSize),
    };
    if (params.search.trim()) {
        query["api.filter"] = "1";
        query["api.filter_column"] = filterColumn;
        query["api.filter_term"] = params.search.trim();
        query["api.filter_type"] = "contains";
    }
    return query;
}

function toPageResult<T>(result: CpanelCallResult, items: T[]): CpanelPageResult<T> {
    const paginate = result.metadata?.paginate as
        | { total_pages?: number; total_results?: number }
        | undefined;
    return {
        items,
        totalPages: paginate?.total_pages ?? 1,
        totalCount: paginate?.total_results ?? items.length,
    };
}

export interface CpanelAccountInfo {
    megabytesUsed: number | null;
    megabytesLimit: number | null;
    raw: unknown;
}

export interface CpanelMailbox {
    email: string;
    diskUsedMb: number;
    diskQuotaMb: number | null;
}

export interface CpanelDomain {
    domain: string;
    kind: "main" | "addon" | "parked" | "subdomain";
}

async function withCpanelCredentials(connection: Connection) {
    const db = await getDb();
    const rows = await db.select<{ username: string }[]>(
        "SELECT username FROM credential WHERE id = $1",
        [connection.credential_id],
    );
    const credential = rows[0];
    if (!credential) throw new Error("Credential not found for this connection");

    const apiToken = await getCredentialSecret(connection.credential_id);

    return {
        host: connection.host,
        port: connection.port,
        username: credential.username,
        apiToken,
    };
}

async function callCpanel(
    creds: { host: string; port: number; username: string; apiToken: string },
    module: string,
    fn: string,
    params: Record<string, string> = {},
): Promise<CpanelCallResult> {
    return invoke<CpanelCallResult>("cpanel_call", { ...creds, module, function: fn, params });
}

function toAccountInfo(result: CpanelCallResult): CpanelAccountInfo {
    return {
        megabytesUsed: result.data?.megabytes_used != null ? Number(result.data.megabytes_used) : null,
        megabytesLimit: result.data?.megabyte_limit != null ? Number(result.data.megabyte_limit) : null,
        raw: result,
    };
}

export async function testCpanelConnection(connection: Connection, resourceId: string): Promise<CpanelAccountInfo> {
    const creds = await withCpanelCredentials(connection);
    try {
        const result = await callCpanel(creds, "Quota", "get_quota_info");
        if (result.status !== 1) {
            throw new Error(describeApiErrors(result, "Authentication failed"));
        }

        const info = toAccountInfo(result);

        const db = await getDb();
        await db.execute(
            "UPDATE connection SET last_verified_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = $1",
            [connection.id],
        );
        await db.execute("UPDATE resource SET metadata = $1 WHERE id = $2", [JSON.stringify(info), resourceId]);

        await recordAudit({ connectionId: connection.id, resourceId, action: "connection.test", detail: null, result: "success" });
        return info;
    } catch (err) {
        await recordAudit({ connectionId: connection.id, resourceId, action: "connection.test", detail: String(err), result: "failure" });
        throw err;
    }
}

export async function getCpanelAccountInfo(connection: Connection): Promise<CpanelAccountInfo> {
    const creds = await withCpanelCredentials(connection);
    const result = await callCpanel(creds, "Quota", "get_quota_info");
    if (result.status !== 1) {
        throw new Error(describeApiErrors(result, "Failed to load account info"));
    }
    return toAccountInfo(result);
}

export async function changeCpanelPassword(
    connection: Connection,
    resourceId: string,
    oldPassword: string,
    newPassword: string,
): Promise<void> {
    const creds = await withCpanelCredentials(connection);
    let result: CpanelCallResult;
    try {
        // Confirmed against the real UAPI OpenAPI spec: the function is
        // Users::change_password (not Passwd::change_password, which does
        // not exist), and it requires both oldpass and newpass.
        result = await callCpanel(creds, "Users", "change_password", { oldpass: oldPassword, newpass: newPassword });
    } catch (err) {
        await recordAudit({ connectionId: connection.id, resourceId, action: "account.password_change", detail: String(err), result: "failure" });
        throw err;
    }

    const ok = result.status === 1;
    // Never log the password value itself — detail is just the outcome.
    await recordAudit({
        connectionId: connection.id,
        resourceId,
        action: "account.password_change",
        detail: ok ? null : describeApiErrors(result, "Password change failed"),
        result: ok ? "success" : "failure",
    });
    if (!ok) throw new Error(describeApiErrors(result, "Password change failed"));
}

export async function listCpanelMailboxes(
    connection: Connection,
    params: CpanelPageParams,
): Promise<CpanelPageResult<CpanelMailbox>> {
    const creds = await withCpanelCredentials(connection);
    // Email::list_pops has no disk-usage fields at all (email/login/
    // suspended_* only, confirmed against the real UAPI OpenAPI spec) —
    // list_pops_with_disk is the function that actually returns
    // diskused/diskquota.
    const result = await callCpanel(creds, "Email", "list_pops_with_disk", buildListQuery("email", params));
    if (result.status !== 1) {
        throw new Error(describeApiErrors(result, "Failed to list mailboxes"));
    }
    const mailboxes = (result.data ?? []) as any[];
    const items = mailboxes.map((m) => ({
        email: String(m.email ?? m.login),
        diskUsedMb: Number(m.diskused ?? 0),
        // diskquota is a number (MB) OR the string "unlimited"/"∞" per the
        // spec — only treat genuine numeric quotas as a limit.
        diskQuotaMb: typeof m.diskquota === "number" ? m.diskquota : null,
    }));
    return toPageResult(result, items);
}

export async function createCpanelMailbox(
    connection: Connection,
    resourceId: string,
    email: string,
    password: string,
    quotaMb: number,
): Promise<void> {
    const creds = await withCpanelCredentials(connection);
    const [account, domain] = email.split("@");
    let result: CpanelCallResult;
    try {
        result = await callCpanel(creds, "Email", "add_pop", {
            email: account,
            domain,
            password,
            quota: String(quotaMb),
        });
    } catch (err) {
        await recordAudit({ connectionId: connection.id, resourceId, action: "email.create", detail: `${email}: ${String(err)}`, result: "failure" });
        throw err;
    }

    const ok = result.status === 1;
    await recordAudit({
        connectionId: connection.id,
        resourceId,
        action: "email.create",
        detail: ok ? email : `${email}: ${describeApiErrors(result, "unknown error")}`,
        result: ok ? "success" : "failure",
    });
    if (!ok) throw new Error(describeApiErrors(result, "Mailbox creation failed"));
}

export async function listCpanelDomains(connection: Connection): Promise<CpanelDomain[]> {
    const creds = await withCpanelCredentials(connection);
    // DomainInfo::list_domains does NOT return one flat list of domain
    // records — confirmed against a real account — it returns four fixed
    // buckets (main_domain: string, the rest: string[]). UAPI's filter/sort/
    // pagination params only apply to functions whose data return is a
    // single flat array of records, so they don't apply here (a real test
    // with api.paginate set showed the params were silently ignored,
    // metadata.paginate never appeared) — this function is fetched in full,
    // and the UI paginates/searches it client-side instead.
    const result = await callCpanel(creds, "DomainInfo", "list_domains");
    if (result.status !== 1) {
        throw new Error(describeApiErrors(result, "Failed to list domains"));
    }
    const data = (result.data ?? {}) as {
        main_domain?: string;
        addon_domains?: string[];
        parked_domains?: string[];
        sub_domains?: string[];
    };
    const domains: CpanelDomain[] = [];
    if (data.main_domain) domains.push({ domain: data.main_domain, kind: "main" });
    for (const domain of data.addon_domains ?? []) domains.push({ domain, kind: "addon" });
    for (const domain of data.parked_domains ?? []) domains.push({ domain, kind: "parked" });
    for (const domain of data.sub_domains ?? []) domains.push({ domain, kind: "subdomain" });
    return domains;
}
