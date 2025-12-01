export const createErrorResponse = (
  message: string,
  status: number
): Response =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
