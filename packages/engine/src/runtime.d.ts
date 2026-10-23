// The only host APIs the engine may use. Every target provides them (browsers,
// Node 20+, React Native/Hermes); typechecking against this list instead of
// the DOM lib keeps browser-only APIs out of shared code.
declare function setTimeout(handler: (...args: never[]) => void, ms?: number): unknown;
declare class AbortSignal {}
declare class AbortController {
  readonly signal: AbortSignal;
  abort(): void;
}
interface Response {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}
declare function fetch(
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal },
): Promise<Response>;
