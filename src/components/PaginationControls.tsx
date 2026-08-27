import { Button, Classes } from "@blueprintjs/core";

export function PaginationControls({
  page,
  totalPages,
  totalCount,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalCount: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginTop: 14,
      }}
    >
      <div className={Classes.TEXT_MUTED} style={{ fontSize: 12 }}>
        {totalCount} total
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Button
          size="small"
          text="Previous"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        />
        <div style={{ fontSize: 12 }}>
          Page {page} of {totalPages}
        </div>
        <Button
          size="small"
          text="Next"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        />
      </div>
    </div>
  );
}
