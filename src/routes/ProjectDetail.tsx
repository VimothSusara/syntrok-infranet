import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, H5, Icon, Spinner, NonIdealState } from "@blueprintjs/core";
import { getProjectById } from "../domain/projects";
import { listEnvironments, createEnvironment } from "../domain/environments";
import { InlineAddForm } from "../components/InlineAddForm";
import { queryKeys } from "../domain/queryKeys";
import { showError } from "../lib/toaster";
import { PageHeader } from "../components/PageHeader";

export function ProjectDetailPage() {
  const { projectId = "" } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();

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

  const createMutation = useMutation({
    mutationFn: (name: string) => createEnvironment(projectId, name),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.environments(projectId),
      }),
    onError: (err) => {
      console.error(`Failed to add environment: ${String(err)}`);
      showError(`Failed to add environment: ${String(err)}`);
    },
  });

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { text: "Projects", to: "/projects" },
          { text: projectQuery.data?.name ?? "…" },
        ]}
        title={projectQuery.data?.name ?? "…"}
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
            <Link
              key={env.id}
              to={`/projects/${projectId}/environments/${env.id}`}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "14px 4px",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 14 }}>{env.name}</div>
              <Icon icon="chevron-right" />
            </Link>
          ))}
        </Card>
      )}

      <InlineAddForm
        placeholder="e.g. production"
        onSubmit={(name) => createMutation.mutate(name)}
      />
    </div>
  );
}
