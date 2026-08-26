import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

export interface ServerPageParams {
    search: string;
    page: number;
    pageSize: number;
}

export interface ServerPageResult<T> {
    items: T[];
    totalPages: number;
    totalCount: number;
}

// Generic client-side state (search text, current page) paired with a
// connector-supplied fetchPage function. Each connection kind's own domain
// file decides how {search, page, pageSize} maps onto its API's real
// filter/sort/pagination conventions (which differ per connector) — this
// hook and the callers that render it never need to know or change.
export function useServerPaginatedList<T>(
    queryKeyBase: readonly unknown[],
    fetchPage: (params: ServerPageParams) => Promise<ServerPageResult<T>>,
    options: { pageSize?: number } = {},
) {
    const { pageSize = 10 } = options;
    const [search, setSearchState] = useState("");
    const [page, setPage] = useState(1);

    const setSearch = (value: string) => {
        setSearchState(value);
        setPage(1);
    };

    const query = useQuery({
        queryKey: [...queryKeyBase, { search, page, pageSize }],
        queryFn: () => fetchPage({ search, page, pageSize }),
        placeholderData: (previous) => previous,
    });

    return {
        search,
        setSearch,
        page,
        setPage,
        totalPages: query.data?.totalPages ?? 1,
        totalCount: query.data?.totalCount ?? 0,
        items: query.data?.items ?? [],
        isLoading: query.isLoading,
        isFetching: query.isFetching,
        isError: query.isError,
        error: query.error,
        refetch: query.refetch,
    };
}
