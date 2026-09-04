import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  Button,
  HTMLTable,
  HTMLSelect,
  Tag,
  Classes,
  NonIdealState,
  Alert,
  Dialog,
  Divider,
  Intent,
  FormGroup,
  InputGroup,
} from "@blueprintjs/core";
import { StickySubHeader } from "../components/StickySubHeader";
import { PaginationControls } from "../components/PaginationControls";
import { PrefixedNameInput } from "../components/PrefixedNameInput";
import { PasswordField } from "../components/PasswordField";
import { usePaginatedList } from "../hooks/usePaginatedList";
import {
  listPostgresDatabases,
  listPostgresUsers,
  createPostgresDatabase,
  deletePostgresDatabase,
  createPostgresUser,
  deletePostgresUser,
  setPostgresUserPassword,
  grantPostgresAllAccess,
  revokePostgresAccess,
  getPostgresRestrictions,
  type CpanelDatabase,
  type CpanelDbUser,
} from "../domain/cpanel";
import { queryKeys } from "../domain/queryKeys";
import { formatBytes } from "../lib/format";
import { showSuccess, showError } from "../lib/toaster";
import { describeError } from "../lib/errors";
import type { CpanelConnectionContext } from "../layouts/CpanelConnectionLayout";

export function CpanelPostgresDatabasesPage() {
  const { connection, resourceId } = useOutletContext<CpanelConnectionContext>();
  const queryClient = useQueryClient();

  const databasesQuery = useQuery({ queryKey: queryKeys.cpanelPostgresDatabases(connection.id), queryFn: () => listPostgresDatabases(connection) });
  const usersQuery = useQuery({ queryKey: queryKeys.cpanelPostgresUsers(connection.id), queryFn: () => listPostgresUsers(connection) });
  // create_database/create_user do NOT apply the account's db-name prefix
  // automatically — confirmed via a real error on the MySQL side; treated
  // the same way here defensively even without an independent Postgres
  // confirmation, since get_restrictions exists for both engines.
  const restrictionsQuery = useQuery({ queryKey: queryKeys.cpanelPostgresRestrictions(connection.id), queryFn: () => getPostgresRestrictions(connection) });
  const prefix = restrictionsQuery.data?.prefix ?? null;

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: queryKeys.cpanelPostgresDatabases(connection.id) });
    queryClient.invalidateQueries({ queryKey: queryKeys.cpanelPostgresUsers(connection.id) });
  }

  const dbList = usePaginatedList(databasesQuery.data ?? [], {
    pageSize: 10,
    searchPredicate: (db, query) => db.name.toLowerCase().includes(query),
  });
  const userList = usePaginatedList(usersQuery.data ?? [], {
    pageSize: 10,
    searchPredicate: (u, query) => u.name.toLowerCase().includes(query),
  });

  const [createDbOpen, setCreateDbOpen] = useState(false);
  const [newDbName, setNewDbName] = useState("");
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [deleteDbTarget, setDeleteDbTarget] = useState<CpanelDatabase | null>(null);
  const [deleteUserTarget, setDeleteUserTarget] = useState<CpanelDbUser | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<CpanelDbUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [newUserPasswordReady, setNewUserPasswordReady] = useState(true);
  const [changePasswordReady, setChangePasswordReady] = useState(true);
  const [manageOpen, setManageOpen] = useState(false);
  const [selectedDb, setSelectedDb] = useState("");
  const [selectedUser, setSelectedUser] = useState("");

  const fullNewDbName = `${prefix ?? ""}${newDbName.trim()}`;

  const createDbMutation = useMutation({
    mutationFn: () => {
      if (!resourceId) throw new Error("Not ready yet");
      return createPostgresDatabase(connection, resourceId, fullNewDbName);
    },
    onSuccess: () => {
      showSuccess(`Created database ${fullNewDbName}`);
      invalidateAll();
    },
    onError: (err) => showError(`Failed to create database: ${describeError(err)}`),
    onSettled: () => {
      setCreateDbOpen(false);
      setNewDbName("");
    },
  });

  const deleteDbMutation = useMutation({
    mutationFn: (db: CpanelDatabase) => {
      if (!resourceId) throw new Error("Not ready yet");
      return deletePostgresDatabase(connection, resourceId, db.name);
    },
    onSuccess: (_r, db) => {
      showSuccess(`Deleted ${db.name}`);
      invalidateAll();
    },
    onError: (err) => showError(`Failed to delete database: ${describeError(err)}`),
    onSettled: () => setDeleteDbTarget(null),
  });

  const fullNewUserName = `${prefix ?? ""}${newUserName.trim()}`;

  const createUserMutation = useMutation({
    mutationFn: () => {
      if (!resourceId) throw new Error("Not ready yet");
      return createPostgresUser(connection, resourceId, fullNewUserName, newUserPassword);
    },
    onSuccess: () => {
      showSuccess(`Created user ${fullNewUserName}`);
      invalidateAll();
    },
    onError: (err) => showError(`Failed to create user: ${describeError(err)}`),
    onSettled: () => {
      setCreateUserOpen(false);
      setNewUserName("");
      setNewUserPassword("");
      setNewUserPasswordReady(true);
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (user: CpanelDbUser) => {
      if (!resourceId) throw new Error("Not ready yet");
      return deletePostgresUser(connection, resourceId, user.name);
    },
    onSuccess: (_r, user) => {
      showSuccess(`Deleted ${user.name}`);
      invalidateAll();
    },
    onError: (err) => showError(`Failed to delete user: ${describeError(err)}`),
    onSettled: () => setDeleteUserTarget(null),
  });

  const passwordMutation = useMutation({
    mutationFn: () => {
      if (!resourceId || !passwordTarget) throw new Error("Not ready yet");
      return setPostgresUserPassword(connection, resourceId, passwordTarget.name, newPassword);
    },
    onSuccess: () => showSuccess(`Password changed for ${passwordTarget?.name}`),
    onError: (err) => showError(`Failed to change password: ${describeError(err)}`),
    onSettled: () => {
      setPasswordTarget(null);
      setNewPassword("");
      setChangePasswordReady(true);
    },
  });

  // No privilege lookup needed: current membership is already known from
  // the loaded databases list's own `users` array.
  const selectedDbEntry = (databasesQuery.data ?? []).find((d) => d.name === selectedDb);
  const hasAccess = selectedDbEntry ? selectedDbEntry.users.includes(selectedUser) : false;

  const accessMutation = useMutation({
    mutationFn: () => {
      if (!resourceId) throw new Error("Not ready yet");
      return hasAccess
        ? revokePostgresAccess(connection, resourceId, selectedDb, selectedUser)
        : grantPostgresAllAccess(connection, resourceId, selectedDb, selectedUser);
    },
    onSuccess: () => {
      showSuccess(hasAccess ? `Revoked ${selectedUser}'s access to ${selectedDb}` : `Granted ${selectedUser} access to ${selectedDb}`);
      invalidateAll();
    },
    onError: (err) => showError(`Failed to update access: ${describeError(err)}`),
  });

  return (
    <div>
      <StickySubHeader
        title="PostgreSQL Databases"
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <Button
              size="small"
              icon="key"
              text="Manage access"
              onClick={() => {
                setSelectedDb("");
                setSelectedUser("");
                setManageOpen(true);
              }}
            />
            <Button
              size="small"
              loading={databasesQuery.isFetching || usersQuery.isFetching}
              text="Refresh"
              onClick={() => {
                databasesQuery.refetch();
                usersQuery.refetch();
              }}
            />
          </div>
        }
      />

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h4 style={{ margin: 0 }}>Databases</h4>
          <div style={{ display: "flex", gap: 8 }}>
            <InputGroup
              leftIcon="search"
              placeholder="Search databases…"
              value={dbList.search}
              onChange={(e) => dbList.setSearch(e.currentTarget.value)}
              style={{ width: 200 }}
            />
            <Button size="small" icon="add" text="Create database" onClick={() => setCreateDbOpen(true)} />
          </div>
        </div>
        {databasesQuery.isError ? (
          <NonIdealState icon="error" title="Could not load databases" description={describeError(databasesQuery.error)} />
        ) : databasesQuery.data === undefined ? (
          <div className={Classes.TEXT_MUTED}>Loading…</div>
        ) : databasesQuery.data.length === 0 ? (
          <NonIdealState icon="database" title="No databases found" />
        ) : dbList.pageItems.length === 0 ? (
          <NonIdealState icon="search" title="No databases match your search" />
        ) : (
          <>
            <HTMLTable compact style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Disk usage</th>
                  <th>Users</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {dbList.pageItems.map((db) => (
                  <tr key={db.name}>
                    <td>{db.name}</td>
                    <td>{formatBytes(db.diskUsageBytes)}</td>
                    <td>
                      {db.users.length === 0 ? (
                        <span className={Classes.TEXT_MUTED}>none</span>
                      ) : (
                        db.users.map((u) => (
                          <Tag key={u} minimal style={{ marginRight: 4 }}>
                            {u}
                          </Tag>
                        ))
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Button size="small" variant="minimal" icon="trash" intent={Intent.DANGER} text="Delete" onClick={() => setDeleteDbTarget(db)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </HTMLTable>
            <PaginationControls page={dbList.page} totalPages={dbList.totalPages} totalCount={dbList.totalCount} onPageChange={dbList.setPage} />
          </>
        )}
      </Card>

      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h4 style={{ margin: 0 }}>Database Users</h4>
          <div style={{ display: "flex", gap: 8 }}>
            <InputGroup
              leftIcon="search"
              placeholder="Search users…"
              value={userList.search}
              onChange={(e) => userList.setSearch(e.currentTarget.value)}
              style={{ width: 200 }}
            />
            <Button size="small" icon="add" text="Create user" onClick={() => setCreateUserOpen(true)} />
          </div>
        </div>
        {usersQuery.isError ? (
          <NonIdealState icon="error" title="Could not load users" description={describeError(usersQuery.error)} />
        ) : usersQuery.data === undefined ? (
          <div className={Classes.TEXT_MUTED}>Loading…</div>
        ) : usersQuery.data.length === 0 ? (
          <NonIdealState icon="person" title="No database users found" />
        ) : userList.pageItems.length === 0 ? (
          <NonIdealState icon="search" title="No users match your search" />
        ) : (
          <>
            <HTMLTable compact style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Databases</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {userList.pageItems.map((user) => (
                  <tr key={user.name}>
                    <td>{user.name}</td>
                    <td>
                      {user.databases.length === 0 ? (
                        <span className={Classes.TEXT_MUTED}>none</span>
                      ) : (
                        user.databases.map((d) => (
                          <Tag key={d} minimal style={{ marginRight: 4 }}>
                            {d}
                          </Tag>
                        ))
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <Button size="small" variant="minimal" icon="key" text="Password" onClick={() => setPasswordTarget(user)} />
                        <Button size="small" variant="minimal" icon="trash" intent={Intent.DANGER} text="Delete" onClick={() => setDeleteUserTarget(user)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </HTMLTable>
            <PaginationControls page={userList.page} totalPages={userList.totalPages} totalCount={userList.totalCount} onPageChange={userList.setPage} />
          </>
        )}
      </Card>

      <Alert
        isOpen={createDbOpen}
        icon="database"
        intent={Intent.PRIMARY}
        confirmButtonText="Create"
        cancelButtonText="Cancel"
        loading={createDbMutation.isPending}
        style={{ width: 460 }}
        onConfirm={() => {
          if (!newDbName.trim()) {
            showError("Enter a database name.");
            return;
          }
          createDbMutation.mutate();
        }}
        onCancel={() => setCreateDbOpen(false)}
        canOutsideClickCancel
      >
        <p>Create a new PostgreSQL database.</p>
        <FormGroup label="Name">
          <PrefixedNameInput prefix={prefix} value={newDbName} onChange={setNewDbName} />
        </FormGroup>
      </Alert>

      <Alert
        isOpen={deleteDbTarget !== null}
        icon="trash"
        intent={Intent.DANGER}
        confirmButtonText="Delete"
        cancelButtonText="Cancel"
        loading={deleteDbMutation.isPending}
        style={{ width: 440 }}
        onConfirm={() => deleteDbTarget && deleteDbMutation.mutate(deleteDbTarget)}
        onCancel={() => setDeleteDbTarget(null)}
        canOutsideClickCancel
      >
        <p>
          Permanently delete <strong>{deleteDbTarget?.name}</strong>? This drops all data in the database and cannot be
          undone.
        </p>
      </Alert>

      <Alert
        isOpen={createUserOpen}
        icon="person"
        intent={Intent.PRIMARY}
        confirmButtonText="Create"
        cancelButtonText="Cancel"
        loading={createUserMutation.isPending}
        style={{ width: 480 }}
        onConfirm={() => {
          if (!newUserName.trim() || !newUserPassword) {
            showError("Enter a username and password.");
            return;
          }
          if (!newUserPasswordReady) {
            showError("Confirm you've copied the generated password first.");
            return;
          }
          createUserMutation.mutate();
        }}
        onCancel={() => {
          setCreateUserOpen(false);
          setNewUserPasswordReady(true);
        }}
        canOutsideClickCancel
      >
        <p>Create a new PostgreSQL database user.</p>
        <FormGroup label="Username">
          <PrefixedNameInput prefix={prefix} value={newUserName} onChange={setNewUserName} />
        </FormGroup>
        <FormGroup label="Password">
          <PasswordField value={newUserPassword} onChange={setNewUserPassword} onReadyChange={setNewUserPasswordReady} />
        </FormGroup>
      </Alert>

      <Alert
        isOpen={deleteUserTarget !== null}
        icon="trash"
        intent={Intent.DANGER}
        confirmButtonText="Delete"
        cancelButtonText="Cancel"
        loading={deleteUserMutation.isPending}
        style={{ width: 440 }}
        onConfirm={() => deleteUserTarget && deleteUserMutation.mutate(deleteUserTarget)}
        onCancel={() => setDeleteUserTarget(null)}
        canOutsideClickCancel
      >
        <p>
          Delete <strong>{deleteUserTarget?.name}</strong>? This also revokes all of this user's database access.
        </p>
      </Alert>

      <Alert
        isOpen={passwordTarget !== null}
        icon="key"
        intent={Intent.PRIMARY}
        confirmButtonText="Change password"
        cancelButtonText="Cancel"
        loading={passwordMutation.isPending}
        style={{ width: 480 }}
        onConfirm={() => {
          if (!newPassword) {
            showError("Enter a new password.");
            return;
          }
          if (!changePasswordReady) {
            showError("Confirm you've copied the generated password first.");
            return;
          }
          passwordMutation.mutate();
        }}
        onCancel={() => {
          setPasswordTarget(null);
          setNewPassword("");
          setChangePasswordReady(true);
        }}
        canOutsideClickCancel
      >
        <p>
          Set a new password for <strong>{passwordTarget?.name}</strong>:
        </p>
        <FormGroup label="New password">
          <PasswordField value={newPassword} onChange={setNewPassword} onReadyChange={setChangePasswordReady} />
        </FormGroup>
      </Alert>

      <Dialog isOpen={manageOpen} onClose={() => setManageOpen(false)} title="Manage Database Access" style={{ width: 560 }}>
        <div style={{ padding: 24 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <FormGroup label="Database">
              <HTMLSelect
                fill
                value={selectedDb}
                onChange={(e) => setSelectedDb(e.currentTarget.value)}
                options={["", ...(databasesQuery.data ?? []).map((d) => d.name)]}
              />
            </FormGroup>
            <FormGroup label="User">
              <HTMLSelect
                fill
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.currentTarget.value)}
                options={["", ...(usersQuery.data ?? []).map((u) => u.name)]}
              />
            </FormGroup>
          </div>

          {selectedDb && selectedUser && (
            <>
              <Divider style={{ margin: "8px 0 16px" }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Tag intent={hasAccess ? Intent.SUCCESS : Intent.NONE} minimal>
                  {hasAccess ? "Has access" : "No access"}
                </Tag>
                <Button
                  text={hasAccess ? "Revoke access" : "Grant access"}
                  intent={hasAccess ? Intent.DANGER : Intent.PRIMARY}
                  loading={accessMutation.isPending}
                  onClick={() => accessMutation.mutate()}
                />
              </div>
            </>
          )}
        </div>
      </Dialog>
    </div>
  );
}
