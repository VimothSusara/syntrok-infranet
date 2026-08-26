import { useMemo, useState } from "react";

export function usePaginatedList<T>(
    items: T[],
    options: { pageSize?: number; searchPredicate?: (item: T, query: string) => boolean } = {},
) {
    const { pageSize = 10, searchPredicate } = options;
    const [search, setSearchState] = useState("");
    const [page, setPage] = useState(1);

    const setSearch = (value: string) => {
        setSearchState(value);
        setPage(1);
    };

    const filtered = useMemo(() => {
        if (!search.trim() || !searchPredicate) return items;
        const query = search.trim().toLowerCase();
        return items.filter((item) => searchPredicate(item, query));
    }, [items, search, searchPredicate]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const clampedPage = Math.min(page, totalPages);
    const pageItems = filtered.slice((clampedPage - 1) * pageSize, clampedPage * pageSize);

    return {
        search,
        setSearch,
        page: clampedPage,
        setPage,
        totalPages,
        totalCount: filtered.length,
        pageItems,
    };
}
