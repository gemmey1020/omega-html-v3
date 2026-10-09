export class CanonicalizationError extends TypeError {
  constructor(
    readonly path: string,
    message: string,
    readonly reason: "model" | "depth" = "model",
  ) {
    super(message);
    this.name = "CanonicalizationError";
  }
}
