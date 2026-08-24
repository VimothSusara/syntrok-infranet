import type { ReactNode } from "react";
import { NonIdealState } from "@blueprintjs/core";
import { getCapabilityState } from "../domain/capabilities";
import type { DiscoveredCapabilities } from "../domain/types";

interface CapabilityGateProps {
  capabilities: DiscoveredCapabilities | null;
  requires: keyof DiscoveredCapabilities;
  label: string;
  children: ReactNode;
}

export function CapabilityGate({
  capabilities,
  requires,
  label,
  children,
}: CapabilityGateProps) {
  const state = getCapabilityState(capabilities, requires);

  if (state === "unknown") {
    return (
      <NonIdealState
        icon="help"
        title="Not yet discovered"
        description={`Run "Test connection" to check whether this server supports ${label}.`}
      />
    );
  }

  if (state === "unavailable") {
    return (
      <NonIdealState
        icon="disable"
        title={`${label} not available`}
        description={`This server does not have ${label} — this feature can't be used here.`}
      />
    );
  }

  return <>{children}</>;
}
