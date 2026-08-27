import { useState } from "react";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  H5,
  Icon,
  Spinner,
  NonIdealState,
  Button,
  Alert,
  Intent,
} from "@blueprintjs/core";
import { getProjectById, listProjects } from "../domain/projects";
import {
  listEnvironments,
  createEnvironment,
  renameEnvironment,
  deleteEnvironment,
  getEnvironmentDeleteImpact,
} from "../domain/environments";
import { InlineAddForm } from "../components/InlineAddForm";
import { EditNameDialog } from "../components/EditNameDialog";
import { SiblingNav } from "../components/SiblingNav";
import { queryKeys } from "../domain/queryKeys";
import { showError, showSuccess } from "../lib/toaster";
import { describeError } from "../lib/errors";
import { PageHeader } from "../components/PageHeader";
import type { Environment } from "../domain/types";
import type { LayoutContext } from "../layouts/AppLayout";

export function ProjectDetailPage() {
  const { projectId = "" } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { workspaceId } = useOutletContext<LayoutContext>();

  const [envToDelete, setEnvToDelete] = useState<Environment | null>(null);
  const [envToEdit, setEnvToEdit] = useState<Environment | null>(null);

  const projectQuery = useQuery({
    queryKey: queryKeys.project(projectId),
    queryFn: () => getProjectById(projectId),
    enabled: !!projectId,
  });

  const environmentsQuery = useQuery({
    queryKey: queryKeys.environments(projectId),
    queryFn: () => listEnvironments(projectId),
    enabled: !!projectId,
  });

  const impactQuery = useQuery({
    queryKey: ["environmentDeleteImpact", envToDelete?.id],
    queryFn: () => getEnvironmentDeleteImpact(envToDelete!.id),
    enabled: !!envToDelete,
  });

  const siblingProjectsQuery = useQuery({
    queryKey: queryKeys.projects(workspaceId),
    queryFn: () => listProjects(workspaceId),
    enabled: !!workspaceId,
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => createEnvironment(projectId, name),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.environments(projectId),
      }),
    onError: (err) =>
      showError(`Failed to add environment: ${describeError(err)}`),
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      renameEnvironment(id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.environments(projectId),
      });
      setEnvToEdit(null);
    },
    onError: (err) =>
      showError(`Failed to rename environment: ${describeError(err)}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteEnvironment(id),
    onSuccess: () => {
      showSuccess("Environment deleted");
      queryClient.invalidateQueries({
        queryKey: queryKeys.environments(projectId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.credentials() });
    },
    onError: (err) =>
      showError(`Failed to delete environment: ${describeError(err)}`),
    onSettled: () => setEnvToDelete(null),
  });

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { text: "Projects", to: "/projects" },
          { text: projectQuery.data?.name ?? "…" },
        ]}
        title={projectQuery.data?.name ?? "…"}
        actions={
          <SiblingNav
            items={siblingProjectsQuery.data ?? []}
            currentId={projectId}
            getPath={(p) => `/projects/${p.id}`}
            getLabel={(p) => p.name}
          />
        }
      />

      <H5 style={{ marginTop: 24 }}>Environments</H5>
      {environmentsQuery.isLoading && <Spinner size={20} />}
      {environmentsQuery.data?.length === 0 && (
        <NonIdealState
          icon="cube"
          title="No environments yet"
          description="Add one below — e.g. production."
        />
      )}
      {environmentsQuery.data && environmentsQuery.data.length > 0 && (
        <Card style={{ marginBottom: 16, padding: "4px 16px" }}>
          {environmentsQuery.data.map((env) => (
            <div
              key={env.id}
              onClick={() =>
                navigate(`/projects/${projectId}/environments/${env.id}`)
              }
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "14px 4px",
                cursor: "pointer",
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 14 }}>{env.name}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                <Button
                  icon="edit"
                  variant="minimal"
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEnvToEdit(env);
                  }}
                />
                <Button
                  icon="trash"
                  variant="minimal"
                  size="small"
                  intent={Intent.DANGER}
                  onClick={(e) => {
                    e.stopPropagation();
                    setEnvToDelete(env);
                  }}
                />
                <Icon icon="chevron-right" />
              </div>
            </div>
          ))}
        </Card>
      )}

      <InlineAddForm
        placeholder="e.g. production"
        onSubmit={(name) => createMutation.mutate(name)}
      />

      <EditNameDialog
        isOpen={envToEdit !== null}
        title="Rename environment"
        label="Environment name"
        initialValue={envToEdit?.name ?? ""}
        loading={renameMutation.isPending}
        onConfirm={(name) =>
          envToEdit && renameMutation.mutate({ id: envToEdit.id, name })
        }
        onClose={() => setEnvToEdit(null)}
      />

      <Alert
        isOpen={envToDelete !== null}
        icon="trash"
        intent={Intent.DANGER}
        confirmButtonText="Delete environment"
        cancelButtonText="Cancel"
        loading={deleteMutation.isPending}
        onConfirm={() => envToDelete && deleteMutation.mutate(envToDelete.id)}
        onCancel={() => setEnvToDelete(null)}
        canOutsideClickCancel
      >
        <p>
          Delete <strong>{envToDelete?.name}</strong>?
          {impactQuery.data
            ? ` This removes ${impactQuery.data.connections} server(s), along with their stored credentials. Audit history is kept.`
            : " Calculating impact…"}
        </p>
      </Alert>
    </div>
  );
}
