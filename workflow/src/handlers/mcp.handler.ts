import {
  JsonRpcMessage,
  SERVER_NAME,
  SERVER_VERSION,
  MCP_PROTOCOL_VERSION,
  SERVER_CAPABILITIES,
  jsonRpcResponse,
  COMMON_HEADERS
} from "./protocol";
import { handleToolsCall, handleToolsList } from "./tools/tools.handler";
import { log } from "../utils/logging.utils";

interface SSEMessage {
  id?: string;
  event?: string;
  data?: any;
  retry?: number;
}

type SSEMessageAsyncGenerator = AsyncGenerator<SSEMessage, void, void>;

const textEncoder = new TextEncoder();

function serializeMessage(message: SSEMessage): Uint8Array {
  let serialized = "";

  if (message.id) {
    serialized += `id: ${message.id}\n`;
  }

  if (message.event) {
    serialized += `event: ${message.event}\n`;
  }

  if (message.retry !== undefined) {
    if (!Number.isInteger(message.retry) || message.retry <= 0) {
      throw new RangeError("The retry is expected to be a positive integer.");
    }
    serialized += `retry: ${message.retry}\n`;
  }

  if (message.data === null || message.data === undefined) {
    serialized += "data:";
  } else {
    const stringifiedData =
      typeof message.data === "object"
        ? JSON.stringify(message.data)
        : String(message.data);

    serialized += stringifiedData
      .split("\n")
      .map((line) => `data: ${line}`)
      .join("\n");
  }

  serialized += "\n\n";
  return textEncoder.encode(serialized);
}

function createSSEStream() {
  return new TransformStream<SSEMessage, Uint8Array>({
    transform(message, controller) {
      try {
        const serialized = serializeMessage(message);
        controller.enqueue(serialized);
      } catch (error) {
        log.error('createSSEStream', 'Error serializing SSE message', error);
        controller.error(error);
      }
    }
  });
}

async function writeMessages(
  stream: TransformStream<SSEMessage, Uint8Array>,
  generator: SSEMessageAsyncGenerator
) {
  const writer = stream.writable.getWriter();
  try {
    for await (const message of generator) {
      await writer.write(message);
    }
  } catch (error) {
    log.error('writeMessages', 'Error writing SSE messages', error);
    const errorMessage: SSEMessage = {
      id: crypto.randomUUID(),
      event: "error",
      data: {
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal error",
          data: error instanceof Error ? error.message : "Unknown error"
        }
      }
    };
    await writer.write(errorMessage);
  } finally {
    await writer.close();
  }
}

async function* processToolCall(message: JsonRpcMessage, headers: Headers): SSEMessageAsyncGenerator {
  try {
    const response = await handleToolsCall(message, headers);
    yield {
      id: crypto.randomUUID(),
      event: "message",
      data: response
    };
  } catch (error) {
    yield {
      id: crypto.randomUUID(),
      event: "error",
      data: jsonRpcResponse(message.id, null, {
        code: -32603,
        message: "Internal error",
        data: error instanceof Error ? error.message : "Unknown error"
      })
    };
  }
}

const processMessage = async (message: JsonRpcMessage, headers: Headers) => {
  const { id, method } = message;
  log.info('processMessage', `Processing message`, { method, id });

  if (!method) {
    return jsonRpcResponse(id, null, { code: -32600, message: "Invalid request: method is required" });
  }

  try {
    switch (method) {
      case "initialize":
        log.debug('processMessage', "Handling initialize request");
        return handleInitialize(message);
      case "notifications/initialized":
        log.debug('processMessage', "Handling notifications/initialized");
        return jsonRpcResponse(id, null);
      case "tools/list":
        log.debug('processMessage', "Handling tools/list request");
        return handleToolsList(message);
      case "tools/call":
        log.debug('processMessage', "Handling tools/call request");
        return await handleToolsCall(message, headers);
      default:
        log.warn('processMessage', `Unknown method received: ${method}`);
        return handleUnknownMethod(message);
    }
  } catch (error) {
    log.error('processMessage', `Error processing message`, error);
    return jsonRpcResponse(id, null, {
      code: -32603,
      message: "Internal error",
      data: error instanceof Error ? error.message : "Unknown error"
    });
  }
};

const handleInitialize = (message: JsonRpcMessage) => {
  return jsonRpcResponse(message.id, {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: SERVER_CAPABILITIES,
    serverInfo: {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
  });
};

const handleUnknownMethod = (message: JsonRpcMessage) => {
  return jsonRpcResponse(message.id, null, { code: -32601, message: `Method not found: ${message.method}` });
};

export const handleMCP = async (request: Request): Promise<Response> => {
  const sessionId = request.headers.get('Mcp-Session-Id') || crypto.randomUUID();
  log.info('handleMCP', `MCP endpoint hit for sessionId: ${sessionId}`);

  // Handle GET requests (SSE stream setup)
  if (request.method === 'GET') {
    const acceptHeader = request.headers.get('Accept');
    if (!acceptHeader?.includes('text/event-stream')) {
      return new Response('Client must accept text/event-stream', {
        status: 400,
        headers: COMMON_HEADERS
      });
    }

    const dummySessionId = 'static-handshake';
    const messages = [
      {
        id: 'static-open-id',
        event: "open",
        data: {
          type: "connection",
          status: "established",
          sessionId: dummySessionId
        },
        retry: 5000
      },
      {
        id: 'static-endpoint-id',
        event: "endpoint",
        data: {
          endpoint: `/mcp?sessionId=${dummySessionId}`,
          type: "endpoint",
          sessionId: dummySessionId
        },
        retry: 5000
      }
    ];

    let bodyBytes = new Uint8Array(0);
    for (const message of messages) {
      bodyBytes = new Uint8Array([...bodyBytes, ...serializeMessage(message)]);
    }

    return new Response(bodyBytes, {
      headers: {
        ...COMMON_HEADERS,
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
        'Connection': 'keep-alive',
        'Mcp-Session-Id': sessionId
      }
    });
  }

  // Handle POST requests
  if (request.method === 'POST') {
    const acceptHeader = request.headers.get('Accept');
    if (!acceptHeader ||
      !(acceptHeader.includes('application/json') || acceptHeader.includes('text/event-stream'))) {
      return new Response('Client must accept application/json or text/event-stream', {
        status: 400,
        headers: COMMON_HEADERS
      });
    }

    try {
      const message = await request.text();
      const jsonMessage: JsonRpcMessage = JSON.parse(message);
      // Handle initialization request
      if (jsonMessage.method === 'initialize') {
        const response = handleInitialize(jsonMessage);
        return new Response(JSON.stringify(response), {
          status: 200,
          headers: {
            ...COMMON_HEADERS,
            'Content-Type': 'application/json',
            'Mcp-Session-Id': sessionId
          }
        });
      }

      // Handle notifications
      if (!jsonMessage.id) {
        if (jsonMessage.method === 'notifications/initialized') {
          log.info('handleMCP', 'Received initialized notification');
        }
        return new Response(null, {
          status: 202,
          headers: COMMON_HEADERS
        });
      }

      // Handle tool calls with SSE streaming
      if (jsonMessage.method === 'tools/call') {
        const stream = createSSEStream();
        writeMessages(stream, processToolCall(jsonMessage, request.headers));

        return new Response(stream.readable, {
          headers: {
            ...COMMON_HEADERS,
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Mcp-Session-Id': sessionId
          }
        });
      }

      // Handle other requests
      const response = await processMessage(jsonMessage, request.headers);
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: {
          ...COMMON_HEADERS,
          'Content-Type': 'application/json',
          'Mcp-Session-Id': sessionId
        }
      });

    } catch (error) {
      log.error('handleMCP', `Error processing POST request`, error);
      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32700,
          message: "Parse error",
          data: error instanceof Error ? error.message : "Invalid JSON"
        }
      }), {
        status: 400,
        headers: {
          ...COMMON_HEADERS,
          'Content-Type': 'application/json'
        }
      });
    }
  }

  // Handle session termination
  if (request.method === 'DELETE') {
    return new Response(null, {
      status: 405,
      headers: COMMON_HEADERS
    });
  }

  return new Response('Method not allowed', {
    status: 405,
    headers: COMMON_HEADERS
  });
};
