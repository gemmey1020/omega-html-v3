/** Native signal lets later child-process/cache/workspace adapters cooperate. */
export interface CancellationToken {
  readonly signal: AbortSignal;
}

export class CancellationError extends Error {
  constructor() {
    super("The Engine operation was cancelled.");
    this.name = "CancellationError";
  }
}

export function throwIfCancellationRequested(token: CancellationToken): void {
  if (token.signal.aborted) throw new CancellationError();
}

export class CancellationTokenSource {
  private readonly controller = new AbortController();
  readonly token: CancellationToken = Object.freeze({
    signal: this.controller.signal,
  });

  cancel(): void {
    // Do not propagate arbitrary caller-supplied reasons into public diagnostics.
    this.controller.abort();
  }
}
