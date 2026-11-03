import { handleCatchUp, type CatchUpRequest, type CatchUpResponse } from "./catchup";

/**
 * The one message contract of the catch-up worker, exported so a test can drive it
 * without starting a thread. It owns no state: one request in, one versioned result
 * out, from the same pure function the inline path uses (spec 18.5, spec 21.1).
 */
export function handleWorkerMessage(
  request: CatchUpRequest | undefined,
  post: (message: CatchUpResponse) => void
): void {
  const response = handleCatchUp(request);
  if (response) post(response);
}

const context = self as unknown as {
  onmessage?: ((event: MessageEvent<CatchUpRequest>) => void) | null;
  postMessage(message: CatchUpResponse): void;
};

context.onmessage = (event) => handleWorkerMessage(event.data, (message) => context.postMessage(message));
