export interface ListParams {
    page?: number;
    pageSize?: number;
    search?: string;
}

export interface ListResult<T> {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
}

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;

export function normalizeListParams(params: ListParams) {
    const pageSize = Math.min(Math.max(Math.trunc(params.pageSize ?? DEFAULT_PAGE_SIZE), 1), MAX_PAGE_SIZE);
    const page = Math.max(Math.trunc(params.page ?? 1), 1);
    const offset = (page - 1) * pageSize;
    return { page, pageSize, offset };
}
