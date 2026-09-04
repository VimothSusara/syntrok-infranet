import { useEffect, useState } from "react";
import { InputGroup, Button, Checkbox, Callout, Intent } from "@blueprintjs/core";
import { showError } from "../lib/toaster";

const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()-_=+";

function generateSecurePassword(length = 20): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CHARSET[b % CHARSET.length]).join("");
}

// A password field with a "Generate secure password" action, mirroring
// cPanel's own password-generator flow: generating reveals the password
// and requires an explicit "I've copied this password" acknowledgment
// before the caller is allowed to submit (via onReadyChange) — manually
// typed passwords are never gated this way, only generated ones, same as
// cPanel's own UI only gates its generator flow.
export function PasswordField({
  value,
  onChange,
  onReadyChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  onReadyChange: (ready: boolean) => void;
  placeholder?: string;
}) {
  const [reveal, setReveal] = useState(false);
  const [justGenerated, setJustGenerated] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    onReadyChange(!justGenerated || confirmed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [justGenerated, confirmed]);

  function handleGenerate() {
    onChange(generateSecurePassword());
    setReveal(true);
    setJustGenerated(true);
    setConfirmed(false);
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      showError("Could not copy to clipboard — copy the password manually.");
    }
  }

  return (
    <div>
      <InputGroup
        fill
        type={reveal ? "text" : "password"}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.currentTarget.value);
          setJustGenerated(false);
        }}
        rightElement={
          <div style={{ display: "flex" }}>
            <Button variant="minimal" icon={reveal ? "eye-off" : "eye-open"} onClick={() => setReveal((v) => !v)} />
            {value && <Button variant="minimal" icon="clipboard" onClick={handleCopy} />}
          </div>
        }
      />
      <div style={{ marginTop: 8 }}>
        <Button size="small" icon="refresh" text="Generate secure password" onClick={handleGenerate} />
      </div>
      {justGenerated && (
        <Callout intent={confirmed ? Intent.SUCCESS : Intent.WARNING} style={{ marginTop: 10 }}>
          <Checkbox
            label="I've copied this password and saved it somewhere safe"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.currentTarget.checked)}
            style={{ margin: 0 }}
          />
        </Callout>
      )}
    </div>
  );
}
