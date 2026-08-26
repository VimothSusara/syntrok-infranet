import type { ReactElement } from "react";
import { useRouteError, isRouteErrorResponse, useNavigate } from "react-router-dom";
import { NonIdealState, Button, Classes } from "@blueprintjs/core";
import classNames from "clsx";

function ErrorShell({
  icon,
  title,
  description,
  action,
}: {
  icon: "search" | "error";
  title: string;
  description: string;
  action: ReactElement;
}) {
  return (
    <div
      className={classNames("app-shell", Classes.DARK)}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        backgroundColor: "var(--bp-surface-background-color-default-rest)",
      }}
    >
      <NonIdealState icon={icon} title={title} description={description} action={action} />
    </div>
  );
}

// createHashRouter's own internal error handling intercepts route-tree
// errors (including "no route matched") before they ever reach the app's
// outer <ErrorBoundary/> — that component only catches errors outside the
// router entirely. Wired as errorElement on the root route, so a genuine
// uncaught render error (or a thrown Response) gets this recoverable
// screen instead of react-router's bare-bones default.
export function RouteErrorBoundary() {
  const error = useRouteError();
  console.error("Route error:", error);

  if (isRouteErrorResponse(error) && error.status === 404) {
    return <NotFoundPage />;
  }

  return (
    <ErrorShell
      icon="error"
      title="Something went wrong"
      description={error instanceof Error ? error.message : String(error)}
      action={<Button text="Reload" onClick={() => window.location.reload()} />}
    />
  );
}

// Also used directly as the element for a plain "*" catch-all route — that
// route matches normally (it's not reached via an error), so it can't rely
// on useRouteError() and needs its own static "not found" UI.
export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <ErrorShell
      icon="search"
      title="Page not found"
      description="That page doesn't exist, or the link is out of date."
      action={<Button text="Go to Dashboard" onClick={() => navigate("/")} />}
    />
  );
}
