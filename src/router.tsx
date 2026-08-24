import { createHashRouter } from "react-router-dom";
import { AppLayout } from "./layouts/AppLayout";
import { DashboardPage } from "./routes/Dashboard";
import { ProjectsListPage } from "./routes/ProjectsList";
import { ProjectDetailPage } from "./routes/ProjectDetail";
import { EnvironmentDetailPage } from "./routes/EnvironmentDetail";
import { ConnectionDetailPage } from "./routes/ConnectionDetail";
import { AuditLogPage } from "./routes/AuditLog";
import { SettingsPage } from "./routes/Settings";

export const router = createHashRouter([
  {
    element: <AppLayout />,
    children: [
      { path: "/", element: <DashboardPage /> },
      { path: "/projects", element: <ProjectsListPage /> },
      { path: "/projects/:projectId", element: <ProjectDetailPage /> },
      {
        path: "/projects/:projectId/environments/:environmentId",
        element: <EnvironmentDetailPage />,
      },
      { path: "/connections/:connectionId", element: <ConnectionDetailPage /> },
      { path: "/audit", element: <AuditLogPage /> },
      { path: "/settings", element: <SettingsPage /> },
    ],
  },
]);
