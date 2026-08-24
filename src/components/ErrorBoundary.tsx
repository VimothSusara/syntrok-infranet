import { Component, type ErrorInfo, type ReactNode } from "react";
import { NonIdealState, Button, Classes } from "@blueprintjs/core";
import classNames from "clsx";

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
        <div
          className={classNames("app-shell", Classes.DARK)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            backgroundColor: "#111418",
            color: "#f6f7f9",
          }}
        >
          <NonIdealState
            icon="error"
            title="Something went wrong"
            description={this.state.error.message}
            action={
              <Button text="Reload" onClick={() => window.location.reload()} />
            }
          />
        </div>
      );
    }

    return this.props.children;
  }
}
