import { Button, Classes } from "@blueprintjs/core";
import { useNavigate } from "react-router-dom";

export function SiblingNav<T extends { id: string }>({
  items,
  currentId,
  getPath,
  getLabel,
}: {
  items: T[];
  currentId: string;
  getPath: (item: T) => string;
  getLabel: (item: T) => string;
}) {
  const navigate = useNavigate();
  const index = items.findIndex((item) => item.id === currentId);
  if (index === -1 || items.length <= 1) return null;

  const prev = index > 0 ? items[index - 1] : null;
  const next = index < items.length - 1 ? items[index + 1] : null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <Button
        icon="chevron-left"
        minimal
        small
        text={prev ? getLabel(prev) : undefined}
        disabled={!prev}
        onClick={() => prev && navigate(getPath(prev))}
      />
      <span className={Classes.TEXT_MUTED} style={{ fontSize: 12, whiteSpace: "nowrap" }}>
        {index + 1} / {items.length}
      </span>
      <Button
        rightIcon="chevron-right"
        minimal
        small
        text={next ? getLabel(next) : undefined}
        disabled={!next}
        onClick={() => next && navigate(getPath(next))}
      />
    </div>
  );
}
