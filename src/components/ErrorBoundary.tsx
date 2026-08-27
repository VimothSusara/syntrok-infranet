import { Component, type ErrorInfo, type ReactNode } from "react";
import { NonIdealState, Button } from "@blueprintjs/core";
import { CenteredShell } from "./layout/CenteredShell";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Unhandled error in app:", error, errorInfo);
  }

  render() {
    if (this.state.error) {
      return (
        <CenteredShell dark>
          <NonIdealState
            icon="error"
            title="Something went wrong"
            description={this.state.error.message}
            action={
              <Button text="Reload" onClick={() => window.location.reload()} />
            }
          />
        </CenteredShell>
      );
    }

    return this.props.children;
  }
}
