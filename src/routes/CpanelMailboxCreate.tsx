import { useState } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, FormGroup, InputGroup, Button, Intent } from "@blueprintjs/core";
import { StickySubHeader } from "../components/StickySubHeader";
import { createCpanelMailbox } from "../domain/cpanel";
import { queryKeys } from "../domain/queryKeys";
import { showSuccess, showError } from "../lib/toaster";
import { describeError } from "../lib/errors";
import type { CpanelConnectionContext } from "../layouts/CpanelConnectionLayout";

export function CpanelMailboxCreatePage() {
  const { connection, resourceId } = useOutletContext<CpanelConnectionContext>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [quota, setQuota] = useState("250");
  const [attempted, setAttempted] = useState(false);

  const trimmedEmail = email.trim();
  const isEmailValid = trimmedEmail.includes("@") && trimmedEmail.split("@")[1]?.length > 0;
  const trimmedPassword = password.trim();
  const quotaNumber = Number(quota);
  const isQuotaValid = Number.isInteger(quotaNumber) && quotaNumber >= 0;
  const isFormValid = isEmailValid && trimmedPassword.length > 0 && isQuotaValid;

  const createMutation = useMutation({
    mutationFn: () => {
      if (!resourceId) throw new Error("Not ready yet");
      return createCpanelMailbox(connection, resourceId, trimmedEmail, trimmedPassword, quotaNumber);
    },
    onSuccess: () => {
      showSuccess(`Created ${trimmedEmail}`);
      queryClient.invalidateQueries({ queryKey: queryKeys.cpanelMailboxes(connection.id) });
      navigate(`/cpanel-connections/${connection.id}/email`);
    },
    onError: (err) => showError(`Failed to create mailbox: ${describeError(err)}`),
  });

  return (
    <div>
      <StickySubHeader title="Create Mailbox" />
      <Card style={{ maxWidth: 480 }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setAttempted(true);
            if (!isFormValid) return;
            createMutation.mutate();
          }}
        >
          <FormGroup
            label="Email address"
            helperText={attempted && !isEmailValid ? "Enter a full address, e.g. sales@example.com." : undefined}
            intent={attempted && !isEmailValid ? Intent.DANGER : Intent.NONE}
          >
            <InputGroup
              placeholder="sales@example.com"
              value={email}
              intent={attempted && !isEmailValid ? Intent.DANGER : Intent.NONE}
              onChange={(e) => setEmail(e.currentTarget.value)}
            />
          </FormGroup>
          <FormGroup
            label="Password"
            helperText={attempted && !trimmedPassword ? "Password is required." : undefined}
            intent={attempted && !trimmedPassword ? Intent.DANGER : Intent.NONE}
          >
            <InputGroup
              type="password"
              value={password}
              intent={attempted && !trimmedPassword ? Intent.DANGER : Intent.NONE}
              onChange={(e) => setPassword(e.currentTarget.value)}
            />
          </FormGroup>
          <FormGroup
            label="Quota (MB, 0 for unlimited)"
            helperText={attempted && !isQuotaValid ? "Enter a whole number." : undefined}
            intent={attempted && !isQuotaValid ? Intent.DANGER : Intent.NONE}
          >
            <InputGroup
              value={quota}
              intent={attempted && !isQuotaValid ? Intent.DANGER : Intent.NONE}
              onChange={(e) => setQuota(e.currentTarget.value)}
            />
          </FormGroup>
          <Button
            type="submit"
            text="Create mailbox"
            intent={Intent.PRIMARY}
            fill
            loading={createMutation.isPending}
            disabled={attempted && !isFormValid}
          />
        </form>
      </Card>
    </div>
  );
}
