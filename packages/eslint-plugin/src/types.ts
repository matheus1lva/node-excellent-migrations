export interface RuleContext {
  getFilename(): string;
  getSourceCode(): { text: string };
  options: unknown[];
  report(descriptor: {
    loc?: {
      start: { line: number; column: number };
      end: { line: number; column: number };
    };
    message: string;
  }): void;
}

export interface RuleModule {
  meta: {
    type: "problem";
    docs: {
      description: string;
      recommended: boolean;
    };
    schema: unknown[];
  };
  create(context: RuleContext): {
    Program(node: { loc?: { start: { line: number; column: number } } }): void;
  };
}
