import { useState } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormGroup, InputGroup, Button, ButtonGroup, Intent, HTMLSelect } from "@blueprintjs/core";
import { FormPageShell } from "../components/layout/FormPageShell";
import { DocumentRootInput } from "../components/DocumentRootInput";
import {
  createCpanelAddonDomain,
  createCpanelSubdomain,
  createCpanelParkedDomain,
  listCpanelDomains,
} from "../domain/cpanel";
import { queryKeys } from "../domain/queryKeys";
import { showSuccess, showError } from "../lib/toaster";
import { describeError } from "../lib/errors";
import type { CpanelConnectionContext } from "../layouts/CpanelConnectionLayout";

type DomainType = "addon" | "subdomain" | "parked";

export function CpanelDomainAddPage() {
  const { connection, resourceId } = useOutletContext<CpanelConnectionContext>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [type, setType] = useState<DomainType>("addon");
  const [attempted, setAttempted] = useState(false);

  const [newDomain, setNewDomain] = useState("");
  const [addonSubLabel, setAddonSubLabel] = useState("");
  const [addonDir, setAddonDir] = useState("");

  const [subLabel, setSubLabel] = useState("");
  const [rootDomain, setRootDomain] = useState("");
  const [subDir, setSubDir] = useState("");

  const [parkDomain, setParkDomain] = useState("");
  const [topDomain, setTopDomain] = useState("");

  const domainsQuery = useQuery({
    queryKey: queryKeys.cpanelDomains(connection.id),
    queryFn: () => listCpanelDomains(connection),
  });
  // A subdomain's root, or a parked domain's park target, both need a
  // domain that already carries its own content — an alias has none.
  const existingDomains = (domainsQuery.data ?? []).filter((d) => d.kind !== "parked");

  const trimmedNewDomain = newDomain.trim();
  const trimmedAddonSubLabel = addonSubLabel.trim();
  const isAddonValid = trimmedNewDomain.length > 0 && trimmedAddonSubLabel.length > 0;

  const trimmedSubLabel = subLabel.trim();
  const isSubValid = trimmedSubLabel.length > 0 && rootDomain.length > 0;

  const trimmedParkDomain = parkDomain.trim();
  const isParkValid = trimmedParkDomain.length > 0;

  const isFormValid = type === "addon" ? isAddonValid : type === "subdomain" ? isSubValid : isParkValid;

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!resourceId) throw new Error("Not ready yet");
      if (type === "addon") {
        await createCpanelAddonDomain(
          connection,
          resourceId,
          trimmedNewDomain,
          trimmedAddonSubLabel,
          addonDir.trim() || undefined,
        );
        return trimmedNewDomain;
      }
      if (type === "subdomain") {
        await createCpanelSubdomain(connection, resourceId, trimmedSubLabel, rootDomain, subDir.trim() || undefined);
        return `${trimmedSubLabel}.${rootDomain}`;
      }
      await createCpanelParkedDomain(connection, resourceId, trimmedParkDomain, topDomain.trim() || undefined);
      return trimmedParkDomain;
    },
    onSuccess: (createdDomain) => {
      showSuccess(`Created ${createdDomain}`);
      queryClient.invalidateQueries({ queryKey: queryKeys.cpanelDomains(connection.id) });
      navigate(`/cpanel-connections/${connection.id}/domain`);
    },
    onError: (err) => showError(`Failed to create domain: ${describeError(err)}`),
  });

  return (
    <FormPageShell title="Add Domain">
      <FormGroup label="Type">
        <ButtonGroup fill>
          <Button
            text="Addon Domain"
            active={type === "addon"}
            onClick={() => {
              setType("addon");
              setAttempted(false);
            }}
          />
          <Button
            text="Subdomain"
            active={type === "subdomain"}
            onClick={() => {
              setType("subdomain");
              setAttempted(false);
            }}
          />
          <Button
            text="Parked Domain"
            active={type === "parked"}
            onClick={() => {
              setType("parked");
              setAttempted(false);
            }}
          />
        </ButtonGroup>
      </FormGroup>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setAttempted(true);
          if (!isFormValid) return;
          createMutation.mutate();
        }}
      >
        {type === "addon" && (
          <>
            <FormGroup
              label="New domain"
              helperText={
                attempted && !trimmedNewDomain ? "Domain is required." : "The domain to add, e.g. example.com."
              }
              intent={attempted && !trimmedNewDomain ? Intent.DANGER : Intent.NONE}
            >
              <InputGroup
                placeholder="example.com"
                value={newDomain}
                intent={attempted && !trimmedNewDomain ? Intent.DANGER : Intent.NONE}
                onChange={(e) => setNewDomain(e.currentTarget.value)}
              />
            </FormGroup>
            <FormGroup
              label="Subdomain label"
              helperText={
                attempted && !trimmedAddonSubLabel
                  ? "Required — cPanel creates and parks this subdomain of your primary domain."
                  : 'e.g. "example" creates example.yourprimarydomain.com behind the scenes.'
              }
              intent={attempted && !trimmedAddonSubLabel ? Intent.DANGER : Intent.NONE}
            >
              <InputGroup
                placeholder="example"
                value={addonSubLabel}
                intent={attempted && !trimmedAddonSubLabel ? Intent.DANGER : Intent.NONE}
                onChange={(e) => setAddonSubLabel(e.currentTarget.value)}
              />
            </FormGroup>
            <FormGroup
              label="Document root (optional)"
              helperText="Leave blank to use the default location under public_html."
            >
              <DocumentRootInput
                connection={connection}
                value={addonDir}
                onChange={setAddonDir}
                placeholder="public_html/example"
              />
            </FormGroup>
          </>
        )}

        {type === "subdomain" && (
          <>
            <FormGroup
              label="Subdomain label"
              helperText={attempted && !trimmedSubLabel ? 'Required, e.g. "blog".' : undefined}
              intent={attempted && !trimmedSubLabel ? Intent.DANGER : Intent.NONE}
            >
              <InputGroup
                placeholder="blog"
                value={subLabel}
                intent={attempted && !trimmedSubLabel ? Intent.DANGER : Intent.NONE}
                onChange={(e) => setSubLabel(e.currentTarget.value)}
              />
            </FormGroup>
            <FormGroup
              label="Root domain"
              helperText={attempted && !rootDomain ? "Must be a domain already on this account." : undefined}
              intent={attempted && !rootDomain ? Intent.DANGER : Intent.NONE}
            >
              <HTMLSelect
                fill
                value={rootDomain}
                onChange={(e) => setRootDomain(e.currentTarget.value)}
                options={[
                  { label: "Select a domain…", value: "" },
                  ...existingDomains.map((d) => ({ label: d.domain, value: d.domain })),
                ]}
              />
            </FormGroup>
            <FormGroup
              label="Document root (optional)"
              helperText="Leave blank to use the default location under public_html."
            >
              <DocumentRootInput
                connection={connection}
                value={subDir}
                onChange={setSubDir}
                placeholder="public_html/blog"
              />
            </FormGroup>
          </>
        )}

        {type === "parked" && (
          <>
            <FormGroup
              label="Domain to park"
              helperText={
                attempted && !trimmedParkDomain
                  ? "Required."
                  : "This domain will serve the same content as your primary domain (an alias)."
              }
              intent={attempted && !trimmedParkDomain ? Intent.DANGER : Intent.NONE}
            >
              <InputGroup
                placeholder="alias-example.com"
                value={parkDomain}
                intent={attempted && !trimmedParkDomain ? Intent.DANGER : Intent.NONE}
                onChange={(e) => setParkDomain(e.currentTarget.value)}
              />
            </FormGroup>
            <FormGroup
              label="Park onto subdomain (optional)"
              helperText='Leave blank to park directly on your primary domain. If set, must be the label of a subdomain that already exists (e.g. "shop", not the full domain).'
            >
              <InputGroup placeholder="shop" value={topDomain} onChange={(e) => setTopDomain(e.currentTarget.value)} />
            </FormGroup>
          </>
        )}

        <Button
          type="submit"
          text={type === "addon" ? "Create addon domain" : type === "subdomain" ? "Create subdomain" : "Park domain"}
          intent={Intent.PRIMARY}
          fill
          loading={createMutation.isPending}
          disabled={attempted && !isFormValid}
          style={{ marginTop: 8 }}
        />
      </form>
    </FormPageShell>
  );
}
