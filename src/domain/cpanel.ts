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

// cPanel API 2's response envelope — confirmed via real captured requests
// from cPanel's own File Manager UI (fileop's op=trash/copy/restorefile).
// Nothing like UAPI's {status, errors, data} shape. fileop's success/
// failure lives per-item in data[].result; mkdir/mkfile have no such field
// on their data items (just {path, name, permissions}) and signal success
// via the top-level event.result instead — both are optional here since
// which one applies depends on the function called.
interface CpanelLegacyResult {
    cpanelresult?: {
        event?: { result?: number };
        data?: { result?: number; reason?: string; src?: string; dest?: string; name?: string; path?: string }[];
        error?: string;
    };
}

async function callCpanelLegacy(
    creds: { host: string; port: number; username: string; apiToken: string },
    module: string,
    fn: string,
    params: Record<string, string> = {},
): Promise<CpanelLegacyResult> {
    return invoke<CpanelLegacyResult>("cpanel_call_legacy", { ...creds, module, function: fn, params });
}

function describeLegacyErrors(result: CpanelLegacyResult, fallback: string): string {
    const item = result.cpanelresult?.data?.[0];
    return item?.reason || result.cpanelresult?.error || fallback;
}

// fileop's `destfiles` param takes a home-relative path with NO leading
// slash — confirmed via a real copy request (destfiles: "container-test",
// resolved against home). This is a third path convention, distinct from
// both UAPI's home-relative-WITH-leading-slash paths and fileop's own
// `sourcefiles` (absolute).
function toFileopDestPath(homeRelativePath: string): string {
    return homeRelativePath === "/" ? "" : homeRelativePath.replace(/^\//, "");
}

async function fileopCpanel(
    creds: { host: string; port: number; username: string; apiToken: string },
    op: "move" | "copy" | "trash" | "restorefile" | "rename",
    sourceAbsolutePath: string,
    destHomeRelativePath?: string,
): Promise<CpanelLegacyResult> {
    const params: Record<string, string> = {
        op,
        sourcefiles: sourceAbsolutePath,
        filelist: "1",
        multiform: "1",
        doubledecode: "0",
    };
    if (destHomeRelativePath !== undefined) params.destfiles = toFileopDestPath(destHomeRelativePath);
    return callCpanelLegacy(creds, "Fileman", "fileop", params);
}

// mkdir/mkfile are separate top-level API 2 functions (not fileop ops) —
// confirmed via real captures. Both take `path` (the PARENT directory,
// home-relative WITH a leading slash — the same convention as UAPI's
// list_files `dir`/entry.path, unlike fileop's absolute sourcefiles or
// its leading-slash-less destfiles) and `name` (the new item's own name).
async function createCpanelPath(
    creds: { host: string; port: number; username: string; apiToken: string },
    fn: "mkdir" | "mkfile",
    parentDir: string,
    name: string,
): Promise<CpanelLegacyResult> {
    return callCpanelLegacy(creds, "Fileman", fn, { path: parentDir, name });
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

export interface CpanelServiceStatus {
    name: string;
    kind: "service" | "metric" | "device";
    ok: boolean;
    value: string;
    version?: string;
}

export async function getCpanelServerInfo(connection: Connection): Promise<CpanelServiceStatus[]> {
    const creds = await withCpanelCredentials(connection);
    const result = await callCpanel(creds, "ServerInformation", "get_information");
    if (result.status !== 1) {
        throw new Error(describeApiErrors(result, "Failed to load server information"));
    }
    const items = (result.data ?? []) as any[];
    return items.map((item) => ({
        name: String(item.name),
        kind: item.type === "metric" || item.type === "device" ? item.type : "service",
        ok: Number(item.status) === 1,
        value: String(item.value),
        version: item.version ? String(item.version) : undefined,
    }));
}

export interface CpanelBandwidthRecord {
    domain: string | null;
    protocol: string;
    bytes: number;
}

export async function getCpanelBandwidth(connection: Connection): Promise<CpanelBandwidthRecord[]> {
    const creds = await withCpanelCredentials(connection);
    // Requires the account to have the "Bandwidth Stats" feature enabled
    // (a WHM Feature Manager setting) — surfaces as a normal API error via
    // `errors` if it's off, not a crash.
    const result = await callCpanel(creds, "Stats", "get_bandwidth");
    if (result.status !== 1) {
        throw new Error(describeApiErrors(result, "Failed to load bandwidth statistics"));
    }
    const items = (result.data ?? []) as any[];
    return items.map((item) => ({
        domain: item.domain != null ? String(item.domain) : null,
        protocol: String(item.protocol),
        bytes: Number(item.bytes ?? 0),
    }));
}

export interface CpanelFileEntry {
    name: string;
    path: string;
    // Absolute server path (e.g. "/home/user/mostro"), taken directly from
    // the list_files response's own item.fullpath. UAPI's Fileman functions
    // all take the home-relative `path`, but API 2's fileop (needed for
    // trash — see trashCpanelFile) takes an absolute `sourcefiles` — this
    // is carried on the entry so callers never have to re-derive it.
    absolutePath: string;
    isDirectory: boolean;
    sizeText: string;
    // Unix seconds * 1000 (JS Date-compatible milliseconds), 0 if unknown.
    modifiedAt: number;
}

// dir is a path relative to the account's home directory ("/" = home,
// "/public_html" = the public_html folder) — confirmed against a real
// account for the top-level case; not independently re-verified for every
// nesting depth, so worth a real test navigating a few levels deep.
export async function listCpanelFiles(connection: Connection, dir: string, showHidden: boolean): Promise<CpanelFileEntry[]> {
    const creds = await withCpanelCredentials(connection);
    const result = await callCpanel(creds, "Fileman", "list_files", { dir, show_hidden: showHidden ? "1" : "0" });
    if (result.status !== 1) {
        throw new Error(describeApiErrors(result, "Failed to list files"));
    }
    // The real response is a single flat array with a `type` field
    // ("dir"/"file"/"link"/...) on each entry — confirmed against a real
    // account. The OpenAPI spec's documented shape ({dirs:[...],
    // files:[...]}) does NOT match this; that schema was wrong.
    //
    // `item.fullpath`/`item.path` are ABSOLUTE server paths
    // (e.g. "/home/user/mostro"), but `dir` (and, presumably, every other
    // Fileman function's path-shaped params) is relative to the account's
    // home directory (e.g. "/mostro") — confirmed by a real "directory
    // does not exist" error caused by feeding an absolute fullpath back in
    // as `dir`. Build the relative path ourselves from the request's own
    // `dir` instead of trusting the response's absolute fields.
    const items = (result.data ?? []) as any[];
    return items.map((item) => {
        const name = String(item.file);
        return {
            name,
            path: dir === "/" ? `/${name}` : `${dir}/${name}`,
            absolutePath: String(item.fullpath ?? item.path ?? ""),
            isDirectory: item.type === "dir",
            sizeText: String(item.humansize ?? "—"),
            modifiedAt: item.mtime ? Number(item.mtime) * 1000 : 0,
        };
    });
}

// Uses legacy cPanel API 2 (fileop, op=rename) — confirmed via a real
// capture, and it's its OWN op, not op=move as previously (wrongly)
// inferred by analogy with copy's rename-during-transfer behavior. Also
// simpler than that guess: destfiles here is just the bare new NAME, no
// path/directory component at all (confirmed: destfiles="test1.js" against
// an absolute sourcefiles several directories deep, response's dest was
// the source's own directory + that bare name).
export async function renameCpanelFile(
    connection: Connection,
    resourceId: string,
    entry: CpanelFileEntry,
    newName: string,
): Promise<void> {
    const creds = await withCpanelCredentials(connection);
    let result: CpanelLegacyResult;
    try {
        result = await fileopCpanel(creds, "rename", entry.absolutePath, newName);
    } catch (err) {
        await recordAudit({ connectionId: connection.id, resourceId, action: "file.rename", detail: `${entry.path}: ${String(err)}`, result: "failure" });
        throw err;
    }

    const ok = result.cpanelresult?.data?.[0]?.result === 1;
    await recordAudit({
        connectionId: connection.id,
        resourceId,
        action: "file.rename",
        detail: ok ? `${entry.path} -> ${newName}` : `${entry.path}: ${describeLegacyErrors(result, "unknown error")}`,
        result: ok ? "success" : "failure",
    });
    if (!ok) throw new Error(describeLegacyErrors(result, "Failed to rename"));
}

async function transferCpanelFile(
    connection: Connection,
    resourceId: string,
    action: "file.move" | "file.copy",
    op: "move" | "copy",
    entry: CpanelFileEntry,
    destinationDir: string,
): Promise<void> {
    const creds = await withCpanelCredentials(connection);
    let result: CpanelLegacyResult;
    try {
        // Passing a directory (not a full path with a new leaf name) as
        // destfiles moves/copies the source INTO it under its existing
        // name — confirmed via a real move response (dest was just the
        // target directory, filename unchanged).
        result = await fileopCpanel(creds, op, entry.absolutePath, destinationDir);
    } catch (err) {
        await recordAudit({ connectionId: connection.id, resourceId, action, detail: `${entry.path}: ${String(err)}`, result: "failure" });
        throw err;
    }

    const ok = result.cpanelresult?.data?.[0]?.result === 1;
    await recordAudit({
        connectionId: connection.id,
        resourceId,
        action,
        detail: ok ? `${entry.path} -> ${destinationDir}` : `${entry.path}: ${describeLegacyErrors(result, "unknown error")}`,
        result: ok ? "success" : "failure",
    });
    if (!ok) throw new Error(describeLegacyErrors(result, action === "file.move" ? "Failed to move" : "Failed to copy"));
}

export function moveCpanelFile(connection: Connection, resourceId: string, entry: CpanelFileEntry, destinationDir: string) {
    return transferCpanelFile(connection, resourceId, "file.move", "move", entry, destinationDir);
}

export function copyCpanelFile(connection: Connection, resourceId: string, entry: CpanelFileEntry, destinationDir: string) {
    return transferCpanelFile(connection, resourceId, "file.copy", "copy", entry, destinationDir);
}

// Soft-delete (reversible via cPanel's own File Manager "Trash" view) —
// deliberately not exposing UAPI's permanent delete_file, matching this
// app's general bias toward reversible destructive actions where the API
// offers one.
//
// Uses legacy cPanel API 2 (fileop, op=trash), not UAPI's documented
// Fileman::trash_file — confirmed via a real network capture of cPanel's
// own File Manager UI performing this exact action, which calls fileop
// this way. sourcefiles takes an ABSOLUTE path (a third, different path
// convention from UAPI's home-relative one), hence entry.absolutePath
// rather than entry.path here. filelist/multiform/doubledecode are sent
// as fixed boilerplate flags, matching what the real UI sends.
export async function trashCpanelFile(connection: Connection, resourceId: string, entry: CpanelFileEntry): Promise<void> {
    const creds = await withCpanelCredentials(connection);
    let result: CpanelLegacyResult;
    try {
        result = await fileopCpanel(creds, "trash", entry.absolutePath);
    } catch (err) {
        await recordAudit({ connectionId: connection.id, resourceId, action: "file.trash", detail: `${entry.path}: ${String(err)}`, result: "failure" });
        throw err;
    }

    const ok = result.cpanelresult?.data?.[0]?.result === 1;
    await recordAudit({
        connectionId: connection.id,
        resourceId,
        action: "file.trash",
        detail: ok ? entry.path : `${entry.path}: ${describeLegacyErrors(result, "unknown error")}`,
        result: ok ? "success" : "failure",
    });
    if (!ok) throw new Error(describeLegacyErrors(result, "Failed to move to trash"));
}

// Derives the account's absolute home directory by diffing a regular
// listing's absolute vs. home-relative path for the same entry — avoids
// hardcoding a "/home/<username>" shape, which isn't guaranteed across
// every server.
async function getCpanelHomeDir(connection: Connection): Promise<string> {
    const entries = await listCpanelFiles(connection, "/", true);
    const sample = entries[0];
    if (!sample) throw new Error("Could not determine home directory");
    return sample.absolutePath.slice(0, sample.absolutePath.length - sample.path.length);
}

export interface CpanelTrashEntry {
    name: string;
    absolutePath: string;
    isDirectory: boolean;
    sizeText: string;
    modifiedAt: number;
}

// Lists the account's Trash folder. Confirmed via a real capture: cPanel's
// own File Manager UI does NOT browse .trash with the regular UAPI
// list_files used elsewhere in this file — it uses legacy API 2's
// `listfiles` instead, with an ABSOLUTE `dir` (yet another distinct path
// convention). This strongly suggests UAPI's list_files can't reach
// .trash at all, so this deliberately does not try to reuse it.
export async function listCpanelTrash(connection: Connection): Promise<CpanelTrashEntry[]> {
    const creds = await withCpanelCredentials(connection);
    const homeDir = await getCpanelHomeDir(connection);
    const result = await callCpanelLegacy(creds, "Fileman", "listfiles", {
        dir: `${homeDir}/.trash`,
        showdotfiles: "1",
    });
    const items = (result.cpanelresult?.data ?? []) as any[];
    return items
        // cPanel's own internal bookkeeping file that tracks each trashed
        // item's original location for restore — not a real trashed item,
        // confirmed present even in an otherwise-empty trash listing.
        .filter((item) => item.file !== ".trash_restore")
        .map((item) => ({
            name: String(item.file),
            absolutePath: String(item.fullpath ?? ""),
            isDirectory: item.type === "dir",
            sizeText: String(item.humansize ?? "—"),
            modifiedAt: item.mtime ? Number(item.mtime) * 1000 : 0,
        }));
}

// op is "restorefile", not "restore" — confirmed via a real capture; an
// earlier capture that claimed to show this actually had op="trash" again
// (mislabeled/duplicate), so this was deliberately left unimplemented until
// a correct one came in. No destfiles: cPanel restores to the original
// location on its own, tracked via the .trash_restore bookkeeping file
// filtered out of listCpanelTrash above.
export async function restoreCpanelTrashItem(connection: Connection, resourceId: string, entry: CpanelTrashEntry): Promise<void> {
    const creds = await withCpanelCredentials(connection);
    let result: CpanelLegacyResult;
    try {
        result = await fileopCpanel(creds, "restorefile", entry.absolutePath);
    } catch (err) {
        await recordAudit({ connectionId: connection.id, resourceId, action: "file.restore", detail: `${entry.name}: ${String(err)}`, result: "failure" });
        throw err;
    }

    const ok = result.cpanelresult?.data?.[0]?.result === 1;
    await recordAudit({
        connectionId: connection.id,
        resourceId,
        action: "file.restore",
        detail: ok ? entry.name : `${entry.name}: ${describeLegacyErrors(result, "unknown error")}`,
        result: ok ? "success" : "failure",
    });
    if (!ok) throw new Error(describeLegacyErrors(result, "Failed to restore"));
}

// mkdir/mkfile signal success via the top-level event.result, not a
// per-item data[].result the way fileop does (their data items only carry
// {path, name, permissions}) — confirmed via real captures of both.
async function createCpanelEntry(
    connection: Connection,
    resourceId: string,
    action: "file.create_folder" | "file.create_file",
    fn: "mkdir" | "mkfile",
    parentDir: string,
    name: string,
): Promise<void> {
    const creds = await withCpanelCredentials(connection);
    const target = parentDir === "/" ? `/${name}` : `${parentDir}/${name}`;
    let result: CpanelLegacyResult;
    try {
        result = await createCpanelPath(creds, fn, parentDir, name);
    } catch (err) {
        await recordAudit({ connectionId: connection.id, resourceId, action, detail: `${target}: ${String(err)}`, result: "failure" });
        throw err;
    }

    const ok = result.cpanelresult?.event?.result === 1;
    await recordAudit({
        connectionId: connection.id,
        resourceId,
        action,
        detail: ok ? target : `${target}: ${describeLegacyErrors(result, "unknown error")}`,
        result: ok ? "success" : "failure",
    });
    if (!ok) throw new Error(describeLegacyErrors(result, fn === "mkdir" ? "Failed to create folder" : "Failed to create file"));
}

export function createCpanelFolder(connection: Connection, resourceId: string, parentDir: string, name: string) {
    return createCpanelEntry(connection, resourceId, "file.create_folder", "mkdir", parentDir, name);
}

export function createCpanelFile(connection: Connection, resourceId: string, parentDir: string, name: string) {
    return createCpanelEntry(connection, resourceId, "file.create_file", "mkfile", parentDir, name);
}

// Text-only editing: the API returns/accepts a plain string with no
// reliable binary/MIME signal in this response, so opening a binary file
// here will show garbled content — a known v1 limitation, not a bug.
export async function getCpanelFileContent(connection: Connection, entry: CpanelFileEntry): Promise<string> {
    const creds = await withCpanelCredentials(connection);
    const dir = entry.path.slice(0, entry.path.lastIndexOf("/")) || "/";
    const result = await callCpanel(creds, "Fileman", "get_file_content", { dir, file: entry.name });
    if (result.status !== 1) {
        throw new Error(describeApiErrors(result, "Failed to read file"));
    }
    return String(result.data?.content ?? "");
}

export async function saveCpanelFileContent(
    connection: Connection,
    resourceId: string,
    entry: CpanelFileEntry,
    content: string,
): Promise<void> {
    const creds = await withCpanelCredentials(connection);
    const dir = entry.path.slice(0, entry.path.lastIndexOf("/")) || "/";
    let result: CpanelCallResult;
    try {
        result = await callCpanel(creds, "Fileman", "save_file_content", { dir, file: entry.name, content });
    } catch (err) {
        await recordAudit({ connectionId: connection.id, resourceId, action: "file.save", detail: `${entry.path}: ${String(err)}`, result: "failure" });
        throw err;
    }

    const ok = result.status === 1;
    await recordAudit({
        connectionId: connection.id,
        resourceId,
        action: "file.save",
        detail: ok ? entry.path : `${entry.path}: ${describeApiErrors(result, "unknown error")}`,
        result: ok ? "success" : "failure",
    });
    if (!ok) throw new Error(describeApiErrors(result, "Failed to save file"));
}

// ---------------------------------------------------------------------
// Database management (MySQL/MariaDB + PostgreSQL) — plain UAPI, verified
// against docs/cpanel.openapi.json. Two independent function sets rather
// than one shared "engine" abstraction: list/create/delete are identical
// enough to share the tiny mapper below, but privilege management
// genuinely differs (MySQL: fine-grained privilege list; PostgreSQL:
// all-or-nothing grant/revoke) — forcing one shared API for that would
// just reintroduce leaky per-engine branching.
// ---------------------------------------------------------------------

export interface CpanelDatabase {
    name: string; // full, prefixed (e.g. "cpuser_dbname")
    diskUsageBytes: number;
    users: string[]; // full, prefixed usernames with any access
}

export interface CpanelDbUser {
    name: string; // full, prefixed
    shortName: string | null; // MySQL only ("shortuser"); null for Postgres
    databases: string[]; // full, prefixed database names
}

export const MYSQL_PRIVILEGES = [
    "ALTER",
    "ALTER ROUTINE",
    "CREATE",
    "CREATE ROUTINE",
    "CREATE TEMPORARY TABLES",
    "CREATE VIEW",
    "DELETE",
    "DROP",
    "EVENT",
    "EXECUTE",
    "INDEX",
    "INSERT",
    "LOCK TABLES",
    "REFERENCES",
    "SELECT",
    "SHOW VIEW",
    "TRIGGER",
    "UPDATE",
] as const;

function mapCpanelDatabase(raw: any): CpanelDatabase {
    return {
        name: String(raw.database),
        diskUsageBytes: Number(raw.disk_usage ?? 0),
        users: (raw.users ?? []).map(String),
    };
}

export async function listMysqlDatabases(connection: Connection): Promise<CpanelDatabase[]> {
    const creds = await withCpanelCredentials(connection);
    const result = await callCpanel(creds, "Mysql", "list_databases");
    if (result.status !== 1) throw new Error(describeApiErrors(result, "Failed to list databases"));
    return ((result.data ?? []) as any[]).map(mapCpanelDatabase);
}

export async function listMysqlUsers(connection: Connection): Promise<CpanelDbUser[]> {
    const creds = await withCpanelCredentials(connection);
    const result = await callCpanel(creds, "Mysql", "list_users");
    if (result.status !== 1) throw new Error(describeApiErrors(result, "Failed to list database users"));
    return ((result.data ?? []) as any[]).map((u) => ({
        name: String(u.user),
        shortName: u.shortuser != null ? String(u.shortuser) : null,
        databases: (u.databases ?? []).map(String),
    }));
}

export interface CpanelDbRestrictions {
    // Full prefix string (e.g. "slsbizh6_"), or null if database prefixing
    // is disabled on this account/server. create_database/create_user do
    // NOT auto-apply this — confirmed via a real "does not begin with the
    // required prefix" error — so the caller must prepend it itself.
    prefix: string | null;
    maxDatabaseNameLength: number;
    maxUsernameLength: number;
}

async function getCpanelDbRestrictions(connection: Connection, engine: DbEngine): Promise<CpanelDbRestrictions> {
    const creds = await withCpanelCredentials(connection);
    const module = engine === "mysql" ? "Mysql" : "Postgresql";
    const result = await callCpanel(creds, module, "get_restrictions");
    if (result.status !== 1) throw new Error(describeApiErrors(result, "Failed to load restrictions"));
    const data = result.data ?? {};
    return {
        prefix: data.prefix || null,
        maxDatabaseNameLength: Number(data.max_database_name_length ?? 64),
        maxUsernameLength: Number(data.max_username_length ?? 16),
    };
}

export function getMysqlRestrictions(connection: Connection) {
    return getCpanelDbRestrictions(connection, "mysql");
}

export function getPostgresRestrictions(connection: Connection) {
    return getCpanelDbRestrictions(connection, "postgresql");
}

export async function listPostgresDatabases(connection: Connection): Promise<CpanelDatabase[]> {
    const creds = await withCpanelCredentials(connection);
    const result = await callCpanel(creds, "Postgresql", "list_databases");
    if (result.status !== 1) throw new Error(describeApiErrors(result, "Failed to list databases"));
    return ((result.data ?? []) as any[]).map(mapCpanelDatabase);
}

// Postgresql::list_users returns a flat array of username strings — no
// shortuser/databases fields at all (confirmed against the real spec,
// unlike MySQL's object-shaped list_users). Each user's database list is
// derived by cross-referencing list_databases' own users[] arrays — the
// same secondary-enrichment technique already used for addon domains'
// domainKey in listCpanelDomains.
export async function listPostgresUsers(connection: Connection): Promise<CpanelDbUser[]> {
    const creds = await withCpanelCredentials(connection);
    const [usersResult, databases] = await Promise.all([
        callCpanel(creds, "Postgresql", "list_users"),
        listPostgresDatabases(connection),
    ]);
    if (usersResult.status !== 1) throw new Error(describeApiErrors(usersResult, "Failed to list database users"));
    const usernames = (usersResult.data ?? []) as string[];
    return usernames.map((name) => ({
        name,
        shortName: null,
        databases: databases.filter((db) => db.users.includes(name)).map((db) => db.name),
    }));
}

type DbEngine = "mysql" | "postgresql";

async function createCpanelDatabase(connection: Connection, resourceId: string, engine: DbEngine, name: string): Promise<void> {
    const creds = await withCpanelCredentials(connection);
    const module = engine === "mysql" ? "Mysql" : "Postgresql";
    let result: CpanelCallResult;
    try {
        result = await callCpanel(creds, module, "create_database", { name });
    } catch (err) {
        await recordAudit({ connectionId: connection.id, resourceId, action: "database.create", detail: `${engine}:${name}: ${String(err)}`, result: "failure" });
        throw err;
    }
    const ok = result.status === 1;
    await recordAudit({
        connectionId: connection.id,
        resourceId,
        action: "database.create",
        detail: ok ? `${engine}:${name}` : `${engine}:${name}: ${describeApiErrors(result, "unknown error")}`,
        result: ok ? "success" : "failure",
    });
    if (!ok) throw new Error(describeApiErrors(result, "Failed to create database"));
}

export function createMysqlDatabase(connection: Connection, resourceId: string, name: string) {
    return createCpanelDatabase(connection, resourceId, "mysql", name);
}

export function createPostgresDatabase(connection: Connection, resourceId: string, name: string) {
    return createCpanelDatabase(connection, resourceId, "postgresql", name);
}

async function deleteCpanelDatabase(connection: Connection, resourceId: string, engine: DbEngine, name: string): Promise<void> {
    const creds = await withCpanelCredentials(connection);
    const module = engine === "mysql" ? "Mysql" : "Postgresql";
    let result: CpanelCallResult;
    try {
        result = await callCpanel(creds, module, "delete_database", { name });
    } catch (err) {
        await recordAudit({ connectionId: connection.id, resourceId, action: "database.delete", detail: `${engine}:${name}: ${String(err)}`, result: "failure" });
        throw err;
    }
    const ok = result.status === 1;
    await recordAudit({
        connectionId: connection.id,
        resourceId,
        action: "database.delete",
        detail: ok ? `${engine}:${name}` : `${engine}:${name}: ${describeApiErrors(result, "unknown error")}`,
        result: ok ? "success" : "failure",
    });
    if (!ok) throw new Error(describeApiErrors(result, "Failed to delete database"));
}

export function deleteMysqlDatabase(connection: Connection, resourceId: string, name: string) {
    return deleteCpanelDatabase(connection, resourceId, "mysql", name);
}

export function deletePostgresDatabase(connection: Connection, resourceId: string, name: string) {
    return deleteCpanelDatabase(connection, resourceId, "postgresql", name);
}

async function createCpanelDbUser(connection: Connection, resourceId: string, engine: DbEngine, name: string, password: string): Promise<void> {
    const creds = await withCpanelCredentials(connection);
    const module = engine === "mysql" ? "Mysql" : "Postgresql";
    let result: CpanelCallResult;
    try {
        result = await callCpanel(creds, module, "create_user", { name, password });
    } catch (err) {
        await recordAudit({ connectionId: connection.id, resourceId, action: "database.user_create", detail: `${engine}:${name}: ${String(err)}`, result: "failure" });
        throw err;
    }
    const ok = result.status === 1;
    // Never log the password value itself — detail is just the outcome.
    await recordAudit({
        connectionId: connection.id,
        resourceId,
        action: "database.user_create",
        detail: ok ? `${engine}:${name}` : `${engine}:${name}: ${describeApiErrors(result, "unknown error")}`,
        result: ok ? "success" : "failure",
    });
    if (!ok) throw new Error(describeApiErrors(result, "Failed to create database user"));
}

export function createMysqlUser(connection: Connection, resourceId: string, name: string, password: string) {
    return createCpanelDbUser(connection, resourceId, "mysql", name, password);
}

export function createPostgresUser(connection: Connection, resourceId: string, name: string, password: string) {
    return createCpanelDbUser(connection, resourceId, "postgresql", name, password);
}

async function deleteCpanelDbUser(connection: Connection, resourceId: string, engine: DbEngine, name: string): Promise<void> {
    const creds = await withCpanelCredentials(connection);
    const module = engine === "mysql" ? "Mysql" : "Postgresql";
    let result: CpanelCallResult;
    try {
        result = await callCpanel(creds, module, "delete_user", { name });
    } catch (err) {
        await recordAudit({ connectionId: connection.id, resourceId, action: "database.user_delete", detail: `${engine}:${name}: ${String(err)}`, result: "failure" });
        throw err;
    }
    const ok = result.status === 1;
    await recordAudit({
        connectionId: connection.id,
        resourceId,
        action: "database.user_delete",
        detail: ok ? `${engine}:${name}` : `${engine}:${name}: ${describeApiErrors(result, "unknown error")}`,
        result: ok ? "success" : "failure",
    });
    if (!ok) throw new Error(describeApiErrors(result, "Failed to delete database user"));
}

export function deleteMysqlUser(connection: Connection, resourceId: string, name: string) {
    return deleteCpanelDbUser(connection, resourceId, "mysql", name);
}

export function deletePostgresUser(connection: Connection, resourceId: string, name: string) {
    return deleteCpanelDbUser(connection, resourceId, "postgresql", name);
}

async function setCpanelDbUserPassword(connection: Connection, resourceId: string, engine: DbEngine, user: string, newPassword: string): Promise<void> {
    const creds = await withCpanelCredentials(connection);
    const module = engine === "mysql" ? "Mysql" : "Postgresql";
    let result: CpanelCallResult;
    try {
        result = await callCpanel(creds, module, "set_password", { user, password: newPassword });
    } catch (err) {
        await recordAudit({ connectionId: connection.id, resourceId, action: "database.user_password_change", detail: `${engine}:${user}: ${String(err)}`, result: "failure" });
        throw err;
    }
    const ok = result.status === 1;
    await recordAudit({
        connectionId: connection.id,
        resourceId,
        action: "database.user_password_change",
        detail: ok ? `${engine}:${user}` : `${engine}:${user}: ${describeApiErrors(result, "unknown error")}`,
        result: ok ? "success" : "failure",
    });
    if (!ok) throw new Error(describeApiErrors(result, "Failed to change password"));
}

export function setMysqlUserPassword(connection: Connection, resourceId: string, user: string, newPassword: string) {
    return setCpanelDbUserPassword(connection, resourceId, "mysql", user, newPassword);
}

export function setPostgresUserPassword(connection: Connection, resourceId: string, user: string, newPassword: string) {
    return setCpanelDbUserPassword(connection, resourceId, "postgresql", user, newPassword);
}

// Read-only lookup used only to pre-fill the privilege checkbox editor
// when opening it for an existing database/user pairing.
export async function getMysqlPrivileges(connection: Connection, database: string, user: string): Promise<string[]> {
    const creds = await withCpanelCredentials(connection);
    const result = await callCpanel(creds, "Mysql", "get_privileges_on_database", { database, user });
    if (result.status !== 1) throw new Error(describeApiErrors(result, "Failed to load privileges"));
    return ((result.data ?? []) as any[]).map(String);
}

export async function setMysqlPrivileges(
    connection: Connection,
    resourceId: string,
    database: string,
    user: string,
    privileges: string[],
): Promise<void> {
    const creds = await withCpanelCredentials(connection);
    let result: CpanelCallResult;
    try {
        result = await callCpanel(creds, "Mysql", "set_privileges_on_database", { database, user, privileges: privileges.join(",") });
    } catch (err) {
        await recordAudit({ connectionId: connection.id, resourceId, action: "database.privileges_update", detail: `${database}:${user} -> ${privileges.join(",")}: ${String(err)}`, result: "failure" });
        throw err;
    }
    const ok = result.status === 1;
    await recordAudit({
        connectionId: connection.id,
        resourceId,
        action: "database.privileges_update",
        detail: ok ? `${database}:${user} -> ${privileges.join(",") || "(none)"}` : `${database}:${user}: ${describeApiErrors(result, "unknown error")}`,
        result: ok ? "success" : "failure",
    });
    if (!ok) throw new Error(describeApiErrors(result, "Failed to update privileges"));
}

export async function revokeMysqlAccess(connection: Connection, resourceId: string, database: string, user: string): Promise<void> {
    const creds = await withCpanelCredentials(connection);
    let result: CpanelCallResult;
    try {
        result = await callCpanel(creds, "Mysql", "revoke_access_to_database", { database, user });
    } catch (err) {
        await recordAudit({ connectionId: connection.id, resourceId, action: "database.access_revoke", detail: `${database}:${user}: ${String(err)}`, result: "failure" });
        throw err;
    }
    const ok = result.status === 1;
    await recordAudit({
        connectionId: connection.id,
        resourceId,
        action: "database.access_revoke",
        detail: ok ? `${database}:${user}` : `${database}:${user}: ${describeApiErrors(result, "unknown error")}`,
        result: ok ? "success" : "failure",
    });
    if (!ok) throw new Error(describeApiErrors(result, "Failed to revoke access"));
}

export async function grantPostgresAllAccess(connection: Connection, resourceId: string, database: string, user: string): Promise<void> {
    const creds = await withCpanelCredentials(connection);
    let result: CpanelCallResult;
    try {
        result = await callCpanel(creds, "Postgresql", "grant_all_privileges", { database, user });
    } catch (err) {
        await recordAudit({ connectionId: connection.id, resourceId, action: "database.privileges_update", detail: `${database}:${user} -> ALL: ${String(err)}`, result: "failure" });
        throw err;
    }
    const ok = result.status === 1;
    await recordAudit({
        connectionId: connection.id,
        resourceId,
        action: "database.privileges_update",
        detail: ok ? `${database}:${user} -> ALL` : `${database}:${user}: ${describeApiErrors(result, "unknown error")}`,
        result: ok ? "success" : "failure",
    });
    if (!ok) throw new Error(describeApiErrors(result, "Failed to grant access"));
}

export async function revokePostgresAccess(connection: Connection, resourceId: string, database: string, user: string): Promise<void> {
    const creds = await withCpanelCredentials(connection);
    let result: CpanelCallResult;
    try {
        result = await callCpanel(creds, "Postgresql", "revoke_all_privileges", { database, user });
    } catch (err) {
        await recordAudit({ connectionId: connection.id, resourceId, action: "database.access_revoke", detail: `${database}:${user}: ${String(err)}`, result: "failure" });
        throw err;
    }
    const ok = result.status === 1;
    await recordAudit({
        connectionId: connection.id,
        resourceId,
        action: "database.access_revoke",
        detail: ok ? `${database}:${user}` : `${database}:${user}: ${describeApiErrors(result, "unknown error")}`,
        result: ok ? "success" : "failure",
    });
    if (!ok) throw new Error(describeApiErrors(result, "Failed to revoke access"));
}

// ---------------------------------------------------------------------
// SSL Certificates — plain UAPI, verified against docs/cpanel.openapi.json.
// install_ssl takes cert/key/cabundle as raw PEM text directly; the
// separate upload_cert/upload_key functions are for a different concern
// (saving to cPanel's cert/key library for reuse) and are out of scope.
// ---------------------------------------------------------------------

export interface CpanelSslCertificate {
    id: string;
    domains: string[];
    issuerCommonName: string;
    notBefore: number; // ms
    notAfter: number; // ms
    isAutoSsl: boolean;
    isSelfSigned: boolean;
    validationType: "ev" | "ov" | "dv" | null;
}

export interface CpanelAutosslProblem {
    domain: string;
    problem: string;
}

export async function listSslCertificates(connection: Connection): Promise<CpanelSslCertificate[]> {
    const creds = await withCpanelCredentials(connection);
    const result = await callCpanel(creds, "SSL", "installed_hosts");
    if (result.status !== 1) throw new Error(describeApiErrors(result, "Failed to list SSL certificates"));
    return ((result.data ?? []) as any[]).map((item) => {
        const cert = item.certificate ?? {};
        return {
            id: String(cert.id ?? ""),
            domains: (cert.domains ?? []).map(String),
            issuerCommonName: String(cert["issuer.commonName"] ?? ""),
            notBefore: cert.not_before ? Number(cert.not_before) * 1000 : 0,
            notAfter: cert.not_after ? Number(cert.not_after) * 1000 : 0,
            isAutoSsl: Number(cert.is_autossl ?? 0) === 1,
            isSelfSigned: Number(cert.is_self_signed ?? 0) === 1,
            validationType: cert.validation_type ?? null,
        };
    });
}

// The real, purpose-built domain picker for "which domains can I install
// a cert on" — used instead of repurposing listCpanelDomains, which is a
// different function built for the Domain tab's own needs.
export async function listSslCapableDomains(connection: Connection): Promise<string[]> {
    const creds = await withCpanelCredentials(connection);
    const result = await callCpanel(creds, "WebVhosts", "list_ssl_capable_domains");
    if (result.status !== 1) throw new Error(describeApiErrors(result, "Failed to list SSL-capable domains"));
    return ((result.data ?? []) as any[]).map((item) => String(item.domain));
}

export async function installSslCertificate(
    connection: Connection,
    resourceId: string,
    domain: string,
    cert: string,
    key: string,
    cabundle?: string,
): Promise<void> {
    const creds = await withCpanelCredentials(connection);
    const params: Record<string, string> = { domain, cert, key };
    if (cabundle) params.cabundle = cabundle;
    let result: CpanelCallResult;
    try {
        result = await callCpanel(creds, "SSL", "install_ssl", params);
    } catch (err) {
        // Never log cert/key contents — a private key is exactly the kind
        // of secret this app's "never log password value" rule exists to
        // protect, extended here to the first non-password secret this
        // connector handles.
        await recordAudit({ connectionId: connection.id, resourceId, action: "ssl.install", detail: `${domain}: ${String(err)}`, result: "failure" });
        throw err;
    }
    const ok = result.status === 1;
    await recordAudit({
        connectionId: connection.id,
        resourceId,
        action: "ssl.install",
        detail: ok ? domain : `${domain}: ${describeApiErrors(result, "unknown error")}`,
        result: ok ? "success" : "failure",
    });
    if (!ok) throw new Error(describeApiErrors(result, "Failed to install certificate"));
}

export async function deleteSslCertificate(connection: Connection, resourceId: string, domain: string): Promise<void> {
    const creds = await withCpanelCredentials(connection);
    let result: CpanelCallResult;
    try {
        result = await callCpanel(creds, "SSL", "delete_ssl", { domain });
    } catch (err) {
        await recordAudit({ connectionId: connection.id, resourceId, action: "ssl.delete", detail: `${domain}: ${String(err)}`, result: "failure" });
        throw err;
    }
    const ok = result.status === 1;
    await recordAudit({
        connectionId: connection.id,
        resourceId,
        action: "ssl.delete",
        detail: ok ? domain : `${domain}: ${describeApiErrors(result, "unknown error")}`,
        result: ok ? "success" : "failure",
    });
    if (!ok) throw new Error(describeApiErrors(result, "Failed to remove certificate"));
}

export async function getAutosslProblems(connection: Connection): Promise<CpanelAutosslProblem[]> {
    const creds = await withCpanelCredentials(connection);
    const result = await callCpanel(creds, "SSL", "get_autossl_problems");
    if (result.status !== 1) throw new Error(describeApiErrors(result, "Failed to load AutoSSL status"));
    return ((result.data ?? []) as any[]).map((item) => ({
        domain: String(item.domain),
        problem: String(item.problem),
    }));
}

export async function startAutosslCheck(connection: Connection, resourceId: string): Promise<void> {
    const creds = await withCpanelCredentials(connection);
    let result: CpanelCallResult;
    try {
        result = await callCpanel(creds, "SSL", "start_autossl_check");
    } catch (err) {
        await recordAudit({ connectionId: connection.id, resourceId, action: "ssl.autossl_check", detail: String(err), result: "failure" });
        throw err;
    }
    const ok = result.status === 1;
    await recordAudit({
        connectionId: connection.id,
        resourceId,
        action: "ssl.autossl_check",
        detail: ok ? null : describeApiErrors(result, "unknown error"),
        result: ok ? "success" : "failure",
    });
    if (!ok) throw new Error(describeApiErrors(result, "Failed to start AutoSSL check"));
}

export async function isAutosslCheckInProgress(connection: Connection): Promise<boolean> {
    const creds = await withCpanelCredentials(connection);
    const result = await callCpanel(creds, "SSL", "is_autossl_check_in_progress");
    if (result.status !== 1) throw new Error(describeApiErrors(result, "Failed to check AutoSSL status"));
    return Number(result.data ?? 0) === 1;
}
