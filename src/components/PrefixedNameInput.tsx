import { InputGroup, Tag } from "@blueprintjs/core";

// cPanel database/user names must already include the account's db prefix
// (e.g. "slsbizh6_") — confirmed via a real "does not begin with the
// required prefix" error; create_database/create_user do NOT apply it
// automatically. This shows the prefix as a fixed, non-editable Tag inside
// the input (Blueprint's own documented pattern for a fixed input prefix)
// so the user only ever types the part they control.
export function PrefixedNameInput({
  prefix,
  value,
  onChange,
  placeholder,
}: {
  prefix: string | null;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <InputGroup
      fill
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
      placeholder={placeholder}
      leftElement={
        prefix ? (
          <Tag minimal style={{ margin: 2 }}>
            {prefix}
          </Tag>
        ) : undefined
      }
    />
  );
}
