import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useOutletContext, useNavigate } from "react-router-dom";
import { Card, H2, H4, Icon } from "@blueprintjs/core";
import { listProjects, createProject } from "../domain/projects";
import { InlineAddForm } from "../components/InlineAddForm";
// import { showError } from "../lib/toaster";
import { queryKeys } from "../domain/queryKeys";
import type { LayoutContext } from "../layouts/AppLayout";
import { showError } from "../lib/toaster";

export function ProjectsListPage() {
  const { workspaceId } = useOutletContext<LayoutContext>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const projectsQuery = useQuery({
    queryKey: queryKeys.projects(workspaceId),
    queryFn: () => listProjects(workspaceId),
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => createProject(workspaceId, name),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.projects(workspaceId),
      }),
    onError: (err) => {
      console.error("Failed to add project:", err);
      showError(`Failed to add project: ${String(err)}`);
    },
  });

  return (
    <div>
      <H2>Projects</H2>
      <div style={{ opacity: 0.7, fontSize: 13, marginBottom: 20 }}>
        {projectsQuery.data?.length ?? 0} projects in this workspace
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 14,
          marginBottom: 20,
        }}
      >
        {projectsQuery.data?.map((project) => (
          <Card
            key={project.id}
            interactive
            onClick={() => navigate(`/projects/${project.id}`)}
          >
            <Icon icon="folder-close" size={20} />
            <H4 style={{ margin: "10px 0 4px" }}>{project.name}</H4>
          </Card>
        ))}
      </div>

      <InlineAddForm
        placeholder="New project name"
        onSubmit={(name) => createMutation.mutate(name)}
      />
    </div>
  );
}
