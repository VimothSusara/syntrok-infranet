import { useEffect, useRef, useState } from "react";
import { InputGroup, Menu, MenuItem, Popover } from "@blueprintjs/core";
import { autocompleteCpanelDirectory } from "../domain/cpanel";
import type { Connection } from "../domain/types";

// Debounced live directory suggestions (Fileman::autocompletedir) for a
// document-root path field — lets a user pick an existing custom
// directory or just type a new one; cPanel creates it during domain
// creation either way, so this is purely a typo-reduction convenience,
// not a required lookup.
export function DocumentRootInput({
    connection,
    value,
    onChange,
    placeholder,
}: {
    connection: Connection;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
}) {
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    useEffect(() => {
        if (!value.trim()) {
            setSuggestions([]);
            return;
        }
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            autocompleteCpanelDirectory(connection, value).then((results) => {
                setSuggestions(results);
                setIsOpen(results.length > 0);
            });
        }, 300);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [value, connection]);

    return (
        <Popover
            isOpen={isOpen && suggestions.length > 0}
            minimal
            placement="bottom-start"
            content={
                <Menu>
                    {suggestions.map((suggestion) => (
                        <MenuItem
                            key={suggestion}
                            text={suggestion}
                            onClick={() => {
                                onChange(suggestion);
                                setIsOpen(false);
                            }}
                        />
                    ))}
                </Menu>
            }
        >
            <InputGroup
                placeholder={placeholder}
                value={value}
                onChange={(e) => {
                    onChange(e.currentTarget.value);
                    setIsOpen(true);
                }}
                onBlur={() => setTimeout(() => setIsOpen(false), 150)}
            />
        </Popover>
    );
}
