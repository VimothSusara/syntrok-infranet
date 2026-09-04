import { createHashRouter, Navigate } from "react-router-dom";
import { AppLayout } from "./layouts/AppLayout";
import { EnvironmentLayout } from "./layouts/EnvironmentLayout";
import { WhmConnectionLayout } from "./layouts/WhmConnectionLayout";
import { CpanelConnectionLayout } from "./layouts/CpanelConnectionLayout";
import { DashboardPage } from "./routes/Dashboard";
import { ProjectsListPage } from "./routes/ProjectsList";
import { ProjectDetailPage } from "./routes/ProjectDetail";
import { EnvironmentSshPage } from "./routes/EnvironmentSsh";
import { EnvironmentWhmPage } from "./routes/EnvironmentWhm";
import { EnvironmentCpanelPage } from "./routes/EnvironmentCpanel";
import { ConnectorComingSoonPage } from "./routes/ConnectorComingSoon";
import { ConnectionDetailPage } from "./routes/ConnectionDetail";
import { WhmOverviewPage } from "./routes/WhmOverview";
import { WhmAccountsPage } from "./routes/WhmAccounts";
import { CpanelAccountPage } from "./routes/CpanelAccount";
import { CpanelMailboxesPage } from "./routes/CpanelMailboxes";
import { CpanelMailboxCreatePage } from "./routes/CpanelMailboxCreate";
import { CpanelDomainsPage } from "./routes/CpanelDomains";
import { CpanelDomainAddPage } from "./routes/CpanelDomainAdd";
import { CpanelServerInfoPage } from "./routes/CpanelServerInfo";
import { CpanelFileManagerPage } from "./routes/CpanelFileManager";
import { CpanelStatisticsPage } from "./routes/CpanelStatistics";
import { CpanelMysqlDatabasesPage } from "./routes/CpanelMysqlDatabases";
import { CpanelPostgresDatabasesPage } from "./routes/CpanelPostgresDatabases";
import { CpanelSslPage } from "./routes/CpanelSsl";
import { CpanelOverviewPage } from "./routes/CpanelOverview";
import { AuditLogPage } from "./routes/AuditLog";
import { SettingsPage } from "./routes/Settings";
import { RouteErrorBoundary, NotFoundPage } from "./components/RouteErrorBoundary";

export const router = createHashRouter([
  {
    element: <AppLayout />,
    errorElement: <RouteErrorBoundary />,
    children: [
      { path: "/", element: <DashboardPage /> },
      { path: "/projects", element: <ProjectsListPage /> },
      { path: "/projects/:projectId", element: <ProjectDetailPage /> },
      {
        path: "/projects/:projectId/environments/:environmentId",
        element: <EnvironmentLayout />,
        children: [
          { index: true, element: <Navigate to="ssh" replace /> },
          { path: "ssh", element: <EnvironmentSshPage /> },
          { path: "whm", element: <EnvironmentWhmPage /> },
          { path: "cpanel", element: <EnvironmentCpanelPage /> },
          {
            path: "docker",
            element: (
              <ConnectorComingSoonPage
                label="Docker"
                icon="box"
                description="Connect to Docker/Podman hosts and manage containers once this connector ships."
              />
            ),
          },
          {
            path: "github",
            element: (
              <ConnectorComingSoonPage
                label="GitHub"
                icon="git-branch"
                description="Connect GitHub repositories and organizations once this connector ships."
              />
            ),
          },
        ],
      },
      { path: "/connections/:connectionId", element: <ConnectionDetailPage /> },
      {
        path: "/whm-connections/:connectionId",
        element: <WhmConnectionLayout />,
        children: [
          { index: true, element: <Navigate to="overview" replace /> },
          { path: "overview", element: <WhmOverviewPage /> },
          { path: "accounts", element: <WhmAccountsPage /> },
          {
            path: "accounts/create",
            element: (
              <ConnectorComingSoonPage
                label="Create Account"
                icon="add"
                description="Provision a new cPanel account on this server once this feature ships."
              />
            ),
          },
          {
            path: "packages",
            element: (
              <ConnectorComingSoonPage
                label="Packages"
                icon="grid-view"
                description="Manage hosting packages/plans once this feature ships."
              />
            ),
          },
          {
            path: "dns",
            element: (
              <ConnectorComingSoonPage
                label="DNS"
                icon="map"
                description="Manage DNS zones for this server once this feature ships."
              />
            ),
          },
          {
            path: "email",
            element: (
              <ConnectorComingSoonPage
                label="Email"
                icon="envelope"
                description="Manage mail accounts and settings once this feature ships."
              />
            ),
          },
          {
            path: "ssl",
            element: (
              <ConnectorComingSoonPage
                label="SSL/TLS"
                icon="lock"
                description="Manage SSL/TLS certificates once this feature ships."
              />
            ),
          },
          {
            path: "server-status",
            element: (
              <ConnectorComingSoonPage
                label="Server Status"
                icon="pulse"
                description="View live service and process status once this feature ships."
              />
            ),
          },
        ],
      },
      {
        path: "/cpanel-connections/:connectionId",
        element: <CpanelConnectionLayout />,
        children: [
          { index: true, element: <Navigate to="overview" replace /> },
          { path: "overview", element: <CpanelOverviewPage /> },
          { path: "account", element: <CpanelAccountPage /> },
          { path: "email", element: <CpanelMailboxesPage /> },
          { path: "email/create", element: <CpanelMailboxCreatePage /> },
          { path: "domain", element: <CpanelDomainsPage /> },
          { path: "domain/add", element: <CpanelDomainAddPage /> },
          { path: "file-manager", element: <CpanelFileManagerPage /> },
          {
            path: "dns",
            element: (
              <ConnectorComingSoonPage
                label="DNS"
                icon="map"
                description="Manage DNS zone records for your domains once this feature ships."
              />
            ),
          },
          { path: "database/mysql", element: <CpanelMysqlDatabasesPage /> },
          { path: "database/postgresql", element: <CpanelPostgresDatabasesPage /> },
          { path: "server-info", element: <CpanelServerInfoPage /> },
          { path: "ssl", element: <CpanelSslPage /> },
          {
            path: "statistics",
            element: <CpanelStatisticsPage />,
          },
        ],
      },
      { path: "/audit", element: <AuditLogPage /> },
      { path: "/settings", element: <SettingsPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
