import { useState, useEffect, type FormEvent } from "react";
import {
  Dialog,
  Classes,
  FormGroup,
  InputGroup,
  Button,
  Intent,
} from "@blueprintjs/core";

export function EditNameDialog({
  isOpen,
  title,
  label,
  initialValue,
  loading,
  onConfirm,
  onClose,
}: {
  isOpen: boolean;
  title: string;
  label: string;
  initialValue: string;
  loading: boolean;
  onConfirm: (name: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initialValue);

  // Dialog instance is reused across different items being edited — reset the
  // draft whenever it opens for a (possibly different) initialValue.
  useEffect(() => {
    if (isOpen) setValue(initialValue);
  }, [isOpen, initialValue]);

  const trimmed = value.trim();
  const isValid = trimmed.length > 0;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isValid || trimmed === initialValue) {
      onClose();
      return;
    }
    onConfirm(trimmed);
  }

  return (
    <Dialog
      isOpen={isOpen}
      title={title}
      onClose={onClose}
      canOutsideClickClose={!loading}
    >
      <form onSubmit={handleSubmit}>
        <div className={Classes.DIALOG_BODY}>
          <FormGroup
            label={label}
            intent={!isValid ? Intent.DANGER : Intent.NONE}
            helperText={!isValid ? "Name can't be empty." : undefined}
          >
            <InputGroup
              autoFocus
              value={value}
              onChange={(e) => setValue(e.currentTarget.value)}
              intent={!isValid ? Intent.DANGER : Intent.NONE}
            />
          </FormGroup>
        </div>
        <div className={Classes.DIALOG_FOOTER}>
          <div className={Classes.DIALOG_FOOTER_ACTIONS}>
            <Button text="Cancel" onClick={onClose} disabled={loading} />
            <Button
              type="submit"
              text="Save"
              intent={Intent.PRIMARY}
              loading={loading}
              disabled={!isValid}
            />
          </div>
        </div>
      </form>
    </Dialog>
  );
}
