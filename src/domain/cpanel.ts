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
    megabytesRemain: number | null;
    inodesUsed: number | null;
    inodeLimit: number | null;
    inodesRemain: number | null;
    raw: unknown;
}

export interface CpanelUsageStat {
    id: string;
    label: string;
    countText: string;
    maxText: string;
    percent: number | null;
}

// The exact same "stats bar" data cPanel's own UI shows, in one call —
// confirmed against the real UAPI OpenAPI spec. "display" is required and
// pipe-delimited; the server may omit an item if it doesn't apply to this
// account/server config (e.g. postgresqldatabases with no PostgreSQL), so
// callers must not assume every requested id comes back.
const USAGE_STAT_IDS = [
    "bandwidthusage",
    "diskusage",
    "emailaccounts",
    "ftpaccounts",
    "mysqldatabases",
    "postgresqldatabases",
    "subdomains",
    "parkeddomains",
    "addondomains",
].join("|");

export interface CpanelMailbox {
    email: string;
    diskUsedMb: number;
    diskQuotaMb: number | null;
}

export interface CpanelDomain {
    domain: string;
    kind: "main" | "addon" | "parked" | "subdomain";
    // Only present for kind "addon" — the underscore-separated
    // subdomain_rootdomain value AddonDomain::deladdondomain requires as
    // its `subdomain` param. DomainInfo::list_domains doesn't provide it;
    // it's merged in from AddonDomain::listaddondomains separately.
    domainKey?: string;
}

export interface CpanelDomainDetail {
    documentRoot: string | null;
    homeDirectory: string | null;
    ip: string | null;
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

function numberOrNull(value: unknown): number | null {
    return value != null ? Number(value) : null;
}

function toAccountInfo(result: CpanelCallResult): CpanelAccountInfo {
    const data = result.data ?? {};
    return {
        megabytesUsed: numberOrNull(data.megabytes_used),
        megabytesLimit: numberOrNull(data.megabyte_limit),
        megabytesRemain: numberOrNull(data.megabytes_remain),
        inodesUsed: numberOrNull(data.inodes_used),
        inodeLimit: numberOrNull(data.inode_limit),
        inodesRemain: numberOrNull(data.inodes_remain),
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

export async function getCpanelUsageStats(connection: Connection): Promise<CpanelUsageStat[]> {
    const creds = await withCpanelCredentials(connection);
    const result = await callCpanel(creds, "StatsBar", "get_stats", { display: USAGE_STAT_IDS });
    if (result.status !== 1) {
        throw new Error(describeApiErrors(result, "Failed to load usage stats"));
    }
    const items = (result.data ?? []) as any[];
    return items.map((item) => ({
        id: String(item.id ?? item.name),
        label: String(item.item ?? item.phrase ?? item.id),
        countText: String(item.count ?? ""),
        maxText: String(item.max ?? ""),
        percent: item.percent != null && !Number.isNaN(Number(item.percent)) ? Number(item.percent) : null,
    }));
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

export async function createCpanelAddonDomain(
    connection: Connection,
    resourceId: string,
    newDomain: string,
    subdomainLabel: string,
    documentRoot?: string,
): Promise<void> {
    const creds = await withCpanelCredentials(connection);
    // AddonDomain::addaddondomain creates a subdomain of the primary domain
    // and parks newDomain on it in one call — cPanel provisions the
    // document root directory itself if it doesn't already exist.
    const params: Record<string, string> = { newdomain: newDomain, subdomain: subdomainLabel };
    if (documentRoot) params.dir = documentRoot;

    let result: CpanelCallResult;
    try {
        result = await callCpanel(creds, "AddonDomain", "addaddondomain", params);
    } catch (err) {
        await recordAudit({ connectionId: connection.id, resourceId, action: "domain.create", detail: `addon ${newDomain}: ${String(err)}`, result: "failure" });
        throw err;
    }

    const ok = result.status === 1;
    await recordAudit({
        connectionId: connection.id,
        resourceId,
        action: "domain.create",
        detail: ok ? `addon: ${newDomain}` : `addon ${newDomain}: ${describeApiErrors(result, "unknown error")}`,
        result: ok ? "success" : "failure",
    });
    if (!ok) throw new Error(describeApiErrors(result, "Failed to create addon domain"));
}

export async function createCpanelSubdomain(
    connection: Connection,
    resourceId: string,
    subdomainLabel: string,
    rootDomain: string,
    documentRoot?: string,
): Promise<void> {
    const creds = await withCpanelCredentials(connection);
    const params: Record<string, string> = { domain: subdomainLabel, rootdomain: rootDomain };
    if (documentRoot) params.dir = documentRoot;
    const fullName = `${subdomainLabel}.${rootDomain}`;

    let result: CpanelCallResult;
    try {
        result = await callCpanel(creds, "SubDomain", "addsubdomain", params);
    } catch (err) {
        await recordAudit({ connectionId: connection.id, resourceId, action: "domain.create", detail: `subdomain ${fullName}: ${String(err)}`, result: "failure" });
        throw err;
    }

    const ok = result.status === 1;
    await recordAudit({
        connectionId: connection.id,
        resourceId,
        action: "domain.create",
        detail: ok ? `subdomain: ${fullName}` : `subdomain ${fullName}: ${describeApiErrors(result, "unknown error")}`,
        result: ok ? "success" : "failure",
    });
    if (!ok) throw new Error(describeApiErrors(result, "Failed to create subdomain"));
}

export async function createCpanelParkedDomain(
    connection: Connection,
    resourceId: string,
    domain: string,
    topDomain?: string,
): Promise<void> {
    const creds = await withCpanelCredentials(connection);
    // Without topdomain, this parks on the account's primary domain.
    // topdomain (when given) must be the label of an EXISTING subdomain of
    // the primary domain — this call does not create one, unlike
    // AddonDomain::addaddondomain which creates+parks in one step.
    const params: Record<string, string> = { domain };
    if (topDomain) params.topdomain = topDomain;

    let result: CpanelCallResult;
    try {
        result = await callCpanel(creds, "Park", "park", params);
    } catch (err) {
        await recordAudit({ connectionId: connection.id, resourceId, action: "domain.create", detail: `parked ${domain}: ${String(err)}`, result: "failure" });
        throw err;
    }

    const ok = result.status === 1;
    await recordAudit({
        connectionId: connection.id,
        resourceId,
        action: "domain.create",
        detail: ok ? `parked: ${domain}` : `parked ${domain}: ${describeApiErrors(result, "unknown error")}`,
        result: ok ? "success" : "failure",
    });
    if (!ok) throw new Error(describeApiErrors(result, "Failed to park domain"));
}

export async function deleteCpanelDomain(
    connection: Connection,
    resourceId: string,
    domain: CpanelDomain,
): Promise<void> {
    const creds = await withCpanelCredentials(connection);
    let result: CpanelCallResult;
    try {
        if (domain.kind === "addon") {
            if (!domain.domainKey) {
                throw new Error("Missing the addon domain's subdomain key — refresh the list and try again.");
            }
            result = await callCpanel(creds, "AddonDomain", "deladdondomain", {
                domain: domain.domain,
                subdomain: domain.domainKey,
            });
        } else if (domain.kind === "subdomain") {
            result = await callCpanel(creds, "SubDomain", "delsubdomain", { domain: domain.domain });
        } else if (domain.kind === "parked") {
            // subdomain param is intentionally omitted — cPanel determines
            // it automatically; only needed when parked on a subdomain
            // rather than the primary domain, which we don't track here.
            result = await callCpanel(creds, "Park", "unpark", { domain: domain.domain });
        } else {
            throw new Error("The main domain cannot be removed.");
        }
    } catch (err) {
        await recordAudit({ connectionId: connection.id, resourceId, action: "domain.delete", detail: `${domain.domain}: ${String(err)}`, result: "failure" });
        throw err;
    }

    const ok = result.status === 1;
    await recordAudit({
        connectionId: connection.id,
        resourceId,
        action: "domain.delete",
        detail: ok ? domain.domain : `${domain.domain}: ${describeApiErrors(result, "unknown error")}`,
        result: ok ? "success" : "failure",
    });
    if (!ok) throw new Error(describeApiErrors(result, "Failed to remove domain"));
}

export async function changeCpanelDocumentRoot(
    connection: Connection,
    resourceId: string,
    domain: string,
    newDocumentRoot: string,
): Promise<void> {
    const creds = await withCpanelCredentials(connection);
    let result: CpanelCallResult;
    try {
        // Unlike creation's `dir`, this does NOT create the target
        // directory — it must already exist, per the real API docs.
        result = await callCpanel(creds, "SubDomain", "changedocroot", { domain, docroot: newDocumentRoot });
    } catch (err) {
        await recordAudit({ connectionId: connection.id, resourceId, action: "domain.change_docroot", detail: `${domain}: ${String(err)}`, result: "failure" });
        throw err;
    }

    const ok = result.status === 1;
    await recordAudit({
        connectionId: connection.id,
        resourceId,
        action: "domain.change_docroot",
        detail: ok ? `${domain} -> ${newDocumentRoot}` : `${domain}: ${describeApiErrors(result, "unknown error")}`,
        result: ok ? "success" : "failure",
    });
    if (!ok) throw new Error(describeApiErrors(result, "Failed to change document root"));
}

// Note: single_domain_data cannot look up a parked (alias) domain — it has
// no user-data file of its own — but that's fine here since document-root
// editing is only ever offered for addon/subdomain kinds anyway.
export async function getCpanelDomainDetail(connection: Connection, domain: string): Promise<CpanelDomainDetail> {
    const creds = await withCpanelCredentials(connection);
    const result = await callCpanel(creds, "DomainInfo", "single_domain_data", { domain });
    if (result.status !== 1) {
        throw new Error(describeApiErrors(result, "Failed to load domain details"));
    }
    const data = result.data ?? {};
    return {
        documentRoot: data.documentroot ?? null,
        homeDirectory: data.homedir ?? null,
        ip: data.ip ?? null,
    };
}

// Powers a live suggestion list for document-root path fields — never
// throws, since it's a UX nicety, not a required step (cPanel provisions
// the directory itself during domain creation regardless).
export async function autocompleteCpanelDirectory(connection: Connection, pathPrefix: string): Promise<string[]> {
    try {
        const creds = await withCpanelCredentials(connection);
        const result = await callCpanel(creds, "Fileman", "autocompletedir", { path: pathPrefix, dirsonly: "1" });
        if (result.status !== 1) return [];
        const items = (result.data ?? []) as any[];
        return items.map((item) => String(item.file));
    } catch {
        return [];
    }
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

    // AddonDomain::deladdondomain requires the paired subdomain's
    // domainkey, which only AddonDomain::listaddondomains provides —
    // DomainInfo::list_domains only gives bare domain-name strings. This
    // secondary lookup is best-effort: if it fails, the list still
    // renders, addon domains just won't be deletable until a retry works.
    if (domains.some((d) => d.kind === "addon")) {
        try {
            const addonResult = await callCpanel(creds, "AddonDomain", "listaddondomains");
            if (addonResult.status === 1) {
                const keyByDomain = new Map<string, string>();
                for (const entry of (addonResult.data ?? []) as any[]) {
                    if (entry.domain && entry.domainkey) keyByDomain.set(String(entry.domain), String(entry.domainkey));
                }
                for (const d of domains) {
                    if (d.kind === "addon") d.domainKey = keyByDomain.get(d.domain);
                }
            }
        } catch {
            // Best-effort — see comment above.
        }
    }

    return domains;
}
