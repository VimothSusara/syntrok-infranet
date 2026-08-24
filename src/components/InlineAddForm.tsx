import { useState } from "react";
import { FormGroup, InputGroup, Button } from "@blueprintjs/core";

export function InlineAddForm({
  placeholder,
  onSubmit,
}: {
  placeholder: string;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim()) return;
        onSubmit(value.trim());
        setValue("");
      }}
    >
      <FormGroup>
        <InputGroup
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.currentTarget.value)}
          rightElement={<Button minimal icon="plus" type="submit" />}
        />
      </FormGroup>
    </form>
  );
}
