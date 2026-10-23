import { handle } from "./relay";

// AWS Lambda entry point, invoked through a Lambda Function URL (payload
// format 2.0). The function's IAM role is its Bedrock credential.

interface FunctionUrlEvent {
  rawPath: string;
  headers?: Record<string, string | undefined>;
  body?: string;
  isBase64Encoded?: boolean;
  requestContext: { http: { method: string; sourceIp: string } };
}

export async function handler(event: FunctionUrlEvent) {
  const body = event.body ? (event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body) : "";
  const res = await handle({
    method: event.requestContext.http.method,
    path: event.rawPath,
    headers: event.headers ?? {},
    body,
    ip: event.requestContext.http.sourceIp,
  });
  return {
    statusCode: res.status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
    body: JSON.stringify(res.body),
  };
}
