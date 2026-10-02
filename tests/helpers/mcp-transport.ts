import type { Client } from "@modelcontextprotocol/client";
import type { McpServer } from "@modelcontextprotocol/server";

type Transport = Parameters<Client["connect"]>[0];

/** A real protocol connection in the test process, so v8 can measure handlers. */
export async function connectInProcess(client: Client, server: McpServer): Promise<void> {
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    clientTransport.onclose?.();
    serverTransport.onclose?.();
  };
  const clientTransport: Transport = {
    async start() {},
    async send(message) {
      if (closed) throw new Error("MCP transport is closed");
      serverTransport.onmessage?.(structuredClone(message));
    },
    close,
  };
  const serverTransport: Transport = {
    async start() {},
    async send(message) {
      if (closed) throw new Error("MCP transport is closed");
      clientTransport.onmessage?.(structuredClone(message));
    },
    close,
  };
  await server.connect(serverTransport);
  await client.connect(clientTransport);
}
