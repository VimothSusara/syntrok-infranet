import { InputGroup, Button } from "@blueprintjs/core";

// Search + refresh action bar — passed as a StickySubHeader's `actions`
// prop. Replaces the identical hand-copied {InputGroup + Refresh Button}
// pair previously duplicated across every searchable list page.
export function ListActionBar({
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search…",
  onRefresh,
  refreshing,
}: {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <InputGroup
        leftIcon="search"
        placeholder={searchPlaceholder}
        value={searchValue}
        onChange={(e) => onSearchChange(e.currentTarget.value)}
        style={{ width: 220 }}
      />
      <Button size="small" text="Refresh" loading={refreshing} onClick={onRefresh} />
    </div>
  );
}
