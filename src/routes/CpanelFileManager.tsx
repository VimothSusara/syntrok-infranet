import { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  Button,
  HTMLTable,
  Icon,
  Classes,
  NonIdealState,
  Alert,
  Intent,
  FormGroup,
  InputGroup,
  Breadcrumbs,
  Dialog,
  TextArea,
  Spinner,
  Switch,
} from "@blueprintjs/core";
import { StickySubHeader } from "../components/StickySubHeader";
import { DocumentRootInput } from "../components/DocumentRootInput";
import {
  listCpanelFiles,
  renameCpanelFile,
  moveCpanelFile,
  copyCpanelFile,
  trashCpanelFile,
  listCpanelTrash,
  restoreCpanelTrashItem,
  createCpanelFolder,
  createCpanelFile,
  getCpanelFileContent,
  saveCpanelFileContent,
  type CpanelFileEntry,
  type CpanelTrashEntry,
} from "../domain/cpanel";
import { queryKeys } from "../domain/queryKeys";
import { showSuccess, showError } from "../lib/toaster";
import { describeError } from "../lib/errors";
import type { CpanelConnectionContext } from "../layouts/CpanelConnectionLayout";

type TransferMode = "move" | "copy";

export function CpanelFileManagerPage() {
  const { connection, resourceId } = useOutletContext<CpanelConnectionContext>();
  const queryClient = useQueryClient();

  const [currentDir, setCurrentDir] = useState("/");
  const [showHidden, setShowHidden] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [renameTarget, setRenameTarget] = useState<CpanelFileEntry | null>(null);
  const [newName, setNewName] = useState("");
  const [transfer, setTransfer] = useState<{ entry: CpanelFileEntry; mode: TransferMode } | null>(null);
  const [destinationDir, setDestinationDir] = useState("");
  const [trashTarget, setTrashTarget] = useState<CpanelFileEntry | null>(null);
  const [editTarget, setEditTarget] = useState<CpanelFileEntry | null>(null);
  const [editedContent, setEditedContent] = useState("");
  const [createKind, setCreateKind] = useState<"folder" | "file" | null>(null);
  const [createName, setCreateName] = useState("");

  const filesQuery = useQuery({
    queryKey: queryKeys.cpanelFiles(connection.id, currentDir, showHidden),
    queryFn: () => listCpanelFiles(connection, currentDir, showHidden),
    enabled: !showTrash,
  });

  const trashQuery = useQuery({
    queryKey: queryKeys.cpanelTrash(connection.id),
    queryFn: () => listCpanelTrash(connection),
    enabled: showTrash,
  });

  function invalidateListing() {
    // Partial key (no showHidden) invalidates both the shown- and
    // hidden-files cached variants for this folder, not just whichever
    // one is currently displayed.
    queryClient.invalidateQueries({ queryKey: ["cpanelFiles", connection.id, currentDir] });
  }

  const renameMutation = useMutation({
    mutationFn: () => {
      if (!resourceId || !renameTarget) throw new Error("Not ready yet");
      return renameCpanelFile(connection, resourceId, renameTarget, newName.trim());
    },
    onSuccess: () => {
      showSuccess(`Renamed to ${newName.trim()}`);
      invalidateListing();
    },
    onError: (err) => showError(`Failed to rename: ${describeError(err)}`),
    onSettled: () => {
      setRenameTarget(null);
      setNewName("");
    },
  });

  const transferMutation = useMutation({
    mutationFn: () => {
      if (!resourceId || !transfer) throw new Error("Not ready yet");
      const fn = transfer.mode === "move" ? moveCpanelFile : copyCpanelFile;
      return fn(connection, resourceId, transfer.entry, destinationDir.trim());
    },
    onSuccess: () => {
      showSuccess(transfer?.mode === "move" ? "Moved" : "Copied");
      invalidateListing();
    },
    onError: (err) => showError(`Failed: ${describeError(err)}`),
    onSettled: () => {
      setTransfer(null);
      setDestinationDir("");
    },
  });

  const trashMutation = useMutation({
    mutationFn: () => {
      if (!resourceId || !trashTarget) throw new Error("Not ready yet");
      return trashCpanelFile(connection, resourceId, trashTarget);
    },
    onSuccess: () => {
      showSuccess(`Moved ${trashTarget?.name} to trash`);
      invalidateListing();
    },
    onError: (err) => showError(`Failed to trash: ${describeError(err)}`),
    onSettled: () => setTrashTarget(null),
  });

  const createMutation = useMutation({
    mutationFn: () => {
      if (!resourceId || !createKind) throw new Error("Not ready yet");
      const fn = createKind === "folder" ? createCpanelFolder : createCpanelFile;
      return fn(connection, resourceId, currentDir, createName.trim());
    },
    onSuccess: () => {
      showSuccess(`Created ${createName.trim()}`);
      invalidateListing();
    },
    onError: (err) => showError(`Failed to create: ${describeError(err)}`),
    onSettled: () => {
      setCreateKind(null);
      setCreateName("");
    },
  });

  // No confirm step — restoring isn't destructive. invalidates both the
  // trash listing and every cached folder listing for this connection
  // (partial key), since the restored item can land back in any folder,
  // not just whichever one is currently open.
  const restoreMutation = useMutation({
    mutationFn: (entry: CpanelTrashEntry) => {
      if (!resourceId) throw new Error("Not ready yet");
      return restoreCpanelTrashItem(connection, resourceId, entry);
    },
    onSuccess: (_data, entry) => {
      showSuccess(`Restored ${entry.name}`);
      queryClient.invalidateQueries({ queryKey: queryKeys.cpanelTrash(connection.id) });
      queryClient.invalidateQueries({ queryKey: ["cpanelFiles", connection.id] });
    },
    onError: (err) => showError(`Failed to restore: ${describeError(err)}`),
  });

  const contentQuery = useQuery({
    queryKey: queryKeys.cpanelFileContent(connection.id, editTarget?.path ?? ""),
    queryFn: () => getCpanelFileContent(connection, editTarget!),
    enabled: editTarget !== null,
  });

  useEffect(() => {
    if (contentQuery.data !== undefined) setEditedContent(contentQuery.data);
  }, [contentQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!resourceId || !editTarget) throw new Error("Not ready yet");
      return saveCpanelFileContent(connection, resourceId, editTarget, editedContent);
    },
    onSuccess: () => {
      showSuccess(`Saved ${editTarget?.name}`);
      invalidateListing();
      setEditTarget(null);
      setEditedContent("");
    },
    onError: (err) => showError(`Failed to save: ${describeError(err)}`),
  });

  const segments = currentDir.split("/").filter(Boolean);
  const breadcrumbItems = [
    { text: "Home", onClick: () => setCurrentDir("/") },
    ...segments.map((segment, index) => ({
      text: segment,
      onClick: () => setCurrentDir(`/${segments.slice(0, index + 1).join("/")}`),
    })),
  ];

  return (
    <div>
      <StickySubHeader
        title={showTrash ? "File Manager — Trash" : "File Manager"}
        actions={
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            {!showTrash && (
              <>
                <Switch
                  label="Show hidden files"
                  checked={showHidden}
                  onChange={(e) => setShowHidden(e.currentTarget.checked)}
                  style={{ margin: 0 }}
                />
                <Button size="small" icon="folder-new" text="New folder" onClick={() => setCreateKind("folder")} />
                <Button size="small" icon="document" text="New file" onClick={() => setCreateKind("file")} />
              </>
            )}
            <Button
              size="small"
              icon={showTrash ? "arrow-left" : "trash"}
              text={showTrash ? "Back to files" : "View trash"}
              onClick={() => setShowTrash((v) => !v)}
            />
            <Button
              size="small"
              text="Refresh"
              loading={showTrash ? trashQuery.isFetching : filesQuery.isFetching}
              onClick={() => (showTrash ? trashQuery.refetch() : filesQuery.refetch())}
            />
          </div>
        }
      />

      {!showTrash && (
        <div style={{ marginBottom: 12 }}>
          <Breadcrumbs items={breadcrumbItems} />
        </div>
      )}

      {showTrash ? (
        <Card>
          {trashQuery.isError ? (
            <NonIdealState icon="error" title="Could not load trash" description={describeError(trashQuery.error)} />
          ) : trashQuery.data === undefined ? (
            <div className={Classes.TEXT_MUTED}>Loading…</div>
          ) : trashQuery.data.length === 0 ? (
            <NonIdealState icon="trash" title="Trash is empty" />
          ) : (
            <HTMLTable compact style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Size</th>
                  <th>Modified</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {trashQuery.data.map((entry) => {
                  const isRestoring = restoreMutation.isPending && restoreMutation.variables?.absolutePath === entry.absolutePath;
                  return (
                    <tr key={entry.absolutePath}>
                      <td>
                        <Icon icon={entry.isDirectory ? "folder-close" : "document"} style={{ marginRight: 8 }} />
                        {entry.name}
                      </td>
                      <td>{entry.sizeText}</td>
                      <td className={Classes.TEXT_MUTED} style={{ fontSize: 12 }}>
                        {entry.modifiedAt ? new Date(entry.modifiedAt).toLocaleString() : "—"}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <Button
                          size="small"
                          variant="minimal"
                          icon="undo"
                          text="Restore"
                          loading={isRestoring}
                          disabled={restoreMutation.isPending && !isRestoring}
                          onClick={() => restoreMutation.mutate(entry)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </HTMLTable>
          )}
        </Card>
      ) : (
      <Card>
        {filesQuery.isError ? (
          <NonIdealState icon="error" title="Could not load this folder" description={describeError(filesQuery.error)} />
        ) : filesQuery.data === undefined ? (
          <div className={Classes.TEXT_MUTED}>Loading…</div>
        ) : filesQuery.data.length === 0 ? (
          <NonIdealState icon="folder-open" title="This folder is empty" />
        ) : (
          <HTMLTable compact interactive style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Size</th>
                <th>Modified</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filesQuery.data.map((entry) => (
                <tr key={entry.path}>
                  <td
                    style={{ cursor: entry.isDirectory ? "pointer" : "default" }}
                    onClick={() => entry.isDirectory && setCurrentDir(entry.path)}
                  >
                    <Icon icon={entry.isDirectory ? "folder-close" : "document"} style={{ marginRight: 8 }} />
                    {entry.name}
                  </td>
                  <td>{entry.sizeText}</td>
                  <td className={Classes.TEXT_MUTED} style={{ fontSize: 12 }}>
                    {entry.modifiedAt ? new Date(entry.modifiedAt).toLocaleString() : "—"}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      {!entry.isDirectory && (
                        <Button
                          size="small"
                          variant="minimal"
                          icon="document-open"
                          onClick={() => setEditTarget(entry)}
                        />
                      )}
                      <Button
                        size="small"
                        variant="minimal"
                        icon="edit"
                        onClick={() => {
                          setRenameTarget(entry);
                          setNewName(entry.name);
                        }}
                      />
                      <Button
                        size="small"
                        variant="minimal"
                        icon="folder-shared"
                        onClick={() => {
                          setTransfer({ entry, mode: "move" });
                          setDestinationDir("");
                        }}
                      />
                      <Button
                        size="small"
                        variant="minimal"
                        icon="duplicate"
                        onClick={() => {
                          setTransfer({ entry, mode: "copy" });
                          setDestinationDir("");
                        }}
                      />
                      <Button
                        size="small"
                        variant="minimal"
                        icon="trash"
                        intent={Intent.DANGER}
                        onClick={() => setTrashTarget(entry)}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </HTMLTable>
        )}
      </Card>
      )}

      <Alert
        isOpen={renameTarget !== null}
        icon="edit"
        intent={Intent.PRIMARY}
        confirmButtonText="Rename"
        cancelButtonText="Cancel"
        loading={renameMutation.isPending}
        style={{ width: 440 }}
        onConfirm={() => {
          if (!newName.trim()) {
            showError("Enter a name.");
            return;
          }
          renameMutation.mutate();
        }}
        onCancel={() => setRenameTarget(null)}
        canOutsideClickCancel
      >
        <p>
          Rename <strong>{renameTarget?.name}</strong>
        </p>
        <FormGroup label="New name">
          <InputGroup value={newName} onChange={(e) => setNewName(e.currentTarget.value)} />
        </FormGroup>
      </Alert>

      <Alert
        isOpen={transfer !== null}
        icon={transfer?.mode === "move" ? "folder-shared" : "duplicate"}
        intent={Intent.PRIMARY}
        confirmButtonText={transfer?.mode === "move" ? "Move" : "Copy"}
        cancelButtonText="Cancel"
        loading={transferMutation.isPending}
        style={{ width: 480 }}
        onConfirm={() => {
          if (!destinationDir.trim()) {
            showError("Enter a destination folder.");
            return;
          }
          transferMutation.mutate();
        }}
        onCancel={() => setTransfer(null)}
        canOutsideClickCancel
      >
        <p>
          {transfer?.mode === "move" ? "Move" : "Copy"} <strong>{transfer?.entry.name}</strong> to a folder that
          already exists:
        </p>
        <FormGroup label="Destination folder">
          <DocumentRootInput
            connection={connection}
            value={destinationDir}
            onChange={setDestinationDir}
            placeholder="/public_html/archive"
          />
        </FormGroup>
      </Alert>

      <Alert
        isOpen={trashTarget !== null}
        icon="trash"
        intent={Intent.DANGER}
        confirmButtonText="Move to trash"
        cancelButtonText="Cancel"
        loading={trashMutation.isPending}
        style={{ width: 440 }}
        onConfirm={() => trashMutation.mutate()}
        onCancel={() => setTrashTarget(null)}
        canOutsideClickCancel
      >
        <p>
          Move <strong>{trashTarget?.name}</strong> to the trash? You can restore it from cPanel's own File Manager
          trash view.
        </p>
      </Alert>

      <Alert
        isOpen={createKind !== null}
        icon={createKind === "folder" ? "folder-new" : "document"}
        intent={Intent.PRIMARY}
        confirmButtonText={createKind === "folder" ? "Create folder" : "Create file"}
        cancelButtonText="Cancel"
        loading={createMutation.isPending}
        style={{ width: 440 }}
        onConfirm={() => {
          if (!createName.trim()) {
            showError("Enter a name.");
            return;
          }
          createMutation.mutate();
        }}
        onCancel={() => setCreateKind(null)}
        canOutsideClickCancel
      >
        <p>
          {createKind === "folder" ? "Create a folder" : "Create a file"} in <strong>{currentDir}</strong>:
        </p>
        <FormGroup label="Name">
          <InputGroup value={createName} onChange={(e) => setCreateName(e.currentTarget.value)} />
        </FormGroup>
      </Alert>

      <Dialog
        isOpen={editTarget !== null}
        onClose={() => {
          setEditTarget(null);
          setEditedContent("");
        }}
        title={editTarget?.name}
        style={{ width: 720 }}
      >
        <div style={{ padding: 20 }}>
          {contentQuery.isLoading ? (
            <Spinner size={24} />
          ) : contentQuery.isError ? (
            <NonIdealState icon="error" title="Could not read this file" description={describeError(contentQuery.error)} />
          ) : (
            <>
              <p className={Classes.TEXT_MUTED} style={{ fontSize: 12 }}>
                Editing as plain text — opening a non-text (binary) file will show garbled content.
              </p>
              <TextArea
                value={editedContent}
                onChange={(e) => setEditedContent(e.currentTarget.value)}
                fill
                style={{ fontFamily: "monospace", fontSize: 12, minHeight: 360 }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
                <Button
                  text="Cancel"
                  onClick={() => {
                    setEditTarget(null);
                    setEditedContent("");
                  }}
                />
                <Button
                  text="Save"
                  intent={Intent.PRIMARY}
                  loading={saveMutation.isPending}
                  onClick={() => saveMutation.mutate()}
                />
              </div>
            </>
          )}
        </div>
      </Dialog>
    </div>
  );
}
