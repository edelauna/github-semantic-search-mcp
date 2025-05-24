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
        console.error('Error serializing SSE message:', error);
        controller.error(error);
      }
    }
  });
}

async function* generateInitialSSEMessages(sessionId: string): SSEMessageAsyncGenerator {
  yield {
    id: crypto.randomUUID(),
    event: "open",
    data: {
      type: "connection",
      status: "established",
      sessionId
    },
    retry: 5000
  };

  yield {
    id: crypto.randomUUID(),
    event: "endpoint",
    data: {
      endpoint: `/mcp?sessionId=${sessionId}`,
      type: "endpoint",
      sessionId
    },
    retry: 5000
  };
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
    console.error('Error writing SSE messages:', error);
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

async function* processToolCall(message: JsonRpcMessage): SSEMessageAsyncGenerator {
  try {
    const response = await handleToolsCall(message);
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

const processMessage = async (message: JsonRpcMessage) => {
  const { id, method } = message;
  console.log(`Processing message with method: ${method}, id: ${id}`);

  if (!method) {
    return jsonRpcResponse(id, null, { code: -32600, message: "Invalid request: method is required" });
  }

  try {
    switch (method) {
      case "initialize":
        console.log("Handling initialize request");
        return handleInitialize(message);
      case "notifications/initialized":
        console.log("Handling notifications/initialized");
        return jsonRpcResponse(id, null);
      case "tools/list":
        console.log("Handling tools/list request");
        return handleToolsList(message);
      case "tools/call":
        console.log("Handling tools/call request");
        return await handleToolsCall(message);
      default:
        console.log(`Handling unknown method: ${method}`);
        return handleUnknownMethod(message);
    }
  } catch (error) {
    console.error(`Error processing message: ${error}`);
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
  console.log(`MCP endpoint hit for sessionId: ${sessionId}`);

  // Handle GET requests (SSE stream setup)
  if (request.method === 'GET') {
    const acceptHeader = request.headers.get('Accept');
    if (!acceptHeader?.includes('text/event-stream')) {
      return new Response('Client must accept text/event-stream', {
        status: 400,
        headers: COMMON_HEADERS
      });
    }

    const stream = createSSEStream();
    writeMessages(stream, generateInitialSSEMessages(sessionId));

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
      console.log('Received message:', jsonMessage);

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
          console.log('Received initialized notification');
        }
        return new Response(null, {
          status: 202,
          headers: COMMON_HEADERS
        });
      }

      // Handle tool calls with SSE streaming
      if (jsonMessage.method === 'tools/call') {
        const stream = createSSEStream();
        writeMessages(stream, processToolCall(jsonMessage));

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
      const response = await processMessage(jsonMessage);
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: {
          ...COMMON_HEADERS,
          'Content-Type': 'application/json',
          'Mcp-Session-Id': sessionId
        }
      });

    } catch (error) {
      console.error(`Error processing POST request: ${error}`);
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
