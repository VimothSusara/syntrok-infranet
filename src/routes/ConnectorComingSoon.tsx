import type { IconName } from "@blueprintjs/icons";
import { NonIdealState } from "@blueprintjs/core";
import { StickySubHeader } from "../components/StickySubHeader";

// Generic placeholder for a connector type with no concrete implementation
// plan yet — unlike EnvironmentWhm.tsx, which is a dedicated file because it
// has a real near-term plan to fill in. One component, driven by props from
// router.tsx, instead of a near-duplicate file per future connector type.
export function ConnectorComingSoonPage({
  label,
  icon,
  description,
}: {
  label: string;
  icon: IconName;
  description: string;
}) {
  return (
    <div>
      <StickySubHeader title={label} />
      <NonIdealState
        icon={icon}
        title={`${label} support coming soon`}
        description={description}
      />
    </div>
  );
}
