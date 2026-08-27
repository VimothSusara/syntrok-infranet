import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useOutletContext, useNavigate } from "react-router-dom";
import { Card, H4, Icon, Button, Alert, Intent } from "@blueprintjs/core";
import {
  listProjects,
  createProject,
  renameProject,
  deleteProject,
  getProjectDeleteImpact,
} from "../domain/projects";
import { InlineAddForm } from "../components/InlineAddForm";
import { TileGrid } from "../components/layout/TileGrid";
import { EditNameDialog } from "../components/EditNameDialog";
import { queryKeys } from "../domain/queryKeys";
import type { LayoutContext } from "../layouts/AppLayout";
import { showError, showSuccess } from "../lib/toaster";
import { describeError } from "../lib/errors";
import { PageHeader } from "../components/PageHeader";
import type { Project } from "../domain/types";

export function ProjectsListPage() {
  const { workspaceId } = useOutletContext<LayoutContext>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null);

  const projectsQuery = useQuery({
    queryKey: queryKeys.projects(workspaceId),
    queryFn: () => listProjects(workspaceId),
  });

  const impactQuery = useQuery({
    queryKey: ["projectDeleteImpact", projectToDelete?.id],
    queryFn: () => getProjectDeleteImpact(projectToDelete!.id),
    enabled: !!projectToDelete,
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => createProject(workspaceId, name),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.projects(workspaceId),
      }),
    onError: (err) => showError(`Failed to add project: ${describeError(err)}`),
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      renameProject(id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.projects(workspaceId),
      });
      setProjectToEdit(null);
    },
    onError: (err) =>
      showError(`Failed to rename project: ${describeError(err)}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteProject(id),
    onSuccess: () => {
      showSuccess("Project deleted");
      queryClient.invalidateQueries({
        queryKey: queryKeys.projects(workspaceId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.credentials() });
    },
    onError: (err) =>
      showError(`Failed to delete project: ${describeError(err)}`),
    onSettled: () => setProjectToDelete(null),
  });

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle={`${projectsQuery.data?.length ?? 0} projects in this workspace`}
      />

      <TileGrid columns={2} style={{ marginBottom: 20 }}>
        {projectsQuery.data?.map((project) => (
          <Card
            key={project.id}
            interactive
            onClick={() => navigate(`/projects/${project.id}`)}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <Icon icon="folder-close" size={20} />
              <div style={{ display: "flex", gap: 2 }}>
                <Button
                  icon="edit"
                  variant="minimal"
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    setProjectToEdit(project);
                  }}
                />
                <Button
                  icon="trash"
                  variant="minimal"
                  size="small"
                  intent={Intent.DANGER}
                  onClick={(e) => {
                    e.stopPropagation();
                    setProjectToDelete(project);
                  }}
                />
              </div>
            </div>
            <H4 style={{ margin: "10px 0 4px" }}>{project.name}</H4>
          </Card>
        ))}
      </TileGrid>

      <InlineAddForm
        placeholder="New project name"
        onSubmit={(name) => createMutation.mutate(name)}
      />

      <EditNameDialog
        isOpen={projectToEdit !== null}
        title="Rename project"
        label="Project name"
        initialValue={projectToEdit?.name ?? ""}
        loading={renameMutation.isPending}
        onConfirm={(name) =>
          projectToEdit && renameMutation.mutate({ id: projectToEdit.id, name })
        }
        onClose={() => setProjectToEdit(null)}
      />

      <Alert
        isOpen={projectToDelete !== null}
        icon="trash"
        intent={Intent.DANGER}
        confirmButtonText="Delete project"
        cancelButtonText="Cancel"
        loading={deleteMutation.isPending}
        onConfirm={() =>
          projectToDelete && deleteMutation.mutate(projectToDelete.id)
        }
        onCancel={() => setProjectToDelete(null)}
        canOutsideClickCancel
      >
        <p>
          Delete <strong>{projectToDelete?.name}</strong>?
          {impactQuery.data
            ? ` This removes ${impactQuery.data.environments} environment(s) and ${impactQuery.data.connections} server(s), along with their stored credentials. Audit history is kept.`
            : " Calculating impact…"}
        </p>
      </Alert>
    </div>
  );
}
