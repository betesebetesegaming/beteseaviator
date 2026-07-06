"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui";

type Props = {
  children: ReactNode;
  /** Short label for the failed section (shown in the fallback). */
  label: string;
  onRetry?: () => void;
};

type State = { error: Error | null };

/** Catches render errors in client subtrees so one panel does not take down the whole app. */
export class ClientErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.label}]`, error, info.componentStack);
  }

  private retry = () => {
    this.setState({ error: null });
    this.props.onRetry?.();
  };

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center">
          <p className="font-semibold text-red-100">{this.props.label} failed to load</p>
          <p className="mt-2 text-sm text-slate-400">
            {this.state.error.message || "Something went wrong. Try again."}
          </p>
          <Button className="mt-4" onClick={this.retry}>
            Try again
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
