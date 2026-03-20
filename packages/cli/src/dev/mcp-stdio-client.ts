import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';

/**
 * MCP stdio client — spawns an MCP server process and communicates via JSON-RPC over stdio.
 * Used in local dev for MCP tool definitions with transport: "stdio".
 */
export class McpStdioClient {
  private process: ChildProcess | null = null;
  private nextId = 1;
  private pendingRequests = new Map<number, {
    resolve: (value: unknown) => void;
    reject: (reason: Error) => void;
  }>();
  public serverCapabilities: Record<string, unknown> = {};

  constructor(
    private readonly command: string,
    private readonly args: string[] = [],
    private readonly env?: Record<string, string>,
  ) {}

  /**
   * Start the MCP server process and initialize the connection.
   */
  async connect(): Promise<void> {
    this.process = spawn(this.command, this.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...this.env },
    });

    if (!this.process.stdout || !this.process.stdin) {
      throw new Error('Failed to create stdio pipes for MCP server');
    }

    // Read JSON-RPC responses line by line
    const rl = createInterface({ input: this.process.stdout });
    rl.on('line', (line) => {
      try {
        const msg = JSON.parse(line) as { id?: number; result?: unknown; error?: { message: string } };
        if (msg.id !== undefined) {
          const pending = this.pendingRequests.get(msg.id);
          if (pending) {
            this.pendingRequests.delete(msg.id);
            if (msg.error) {
              pending.reject(new Error(msg.error.message));
            } else {
              pending.resolve(msg.result);
            }
          }
        }
      } catch {
        // Ignore non-JSON lines (stderr/logs)
      }
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      console.error(`[mcp:${this.command}] ${data.toString().trim()}`);
    });

    this.process.on('exit', (code) => {
      // Reject all pending requests
      for (const [, pending] of this.pendingRequests) {
        pending.reject(new Error(`MCP server exited with code ${code}`));
      }
      this.pendingRequests.clear();
    });

    // Send initialize request
    const initResult = await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'agentsy-cli', version: '0.0.1' },
    }) as { capabilities?: Record<string, unknown> };

    this.serverCapabilities = initResult?.capabilities ?? {};

    // Send initialized notification
    this.notify('notifications/initialized', {});
  }

  /**
   * Discover available tools from the MCP server.
   */
  async listTools(): Promise<Array<{
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
  }>> {
    const result = await this.request('tools/list', {}) as {
      tools?: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>;
    };
    return result?.tools ?? [];
  }

  /**
   * Call a tool on the MCP server.
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const result = await this.request('tools/call', { name, arguments: args }) as {
      content?: Array<{ type: string; text?: string }>;
    };

    // Extract text content
    const texts = (result?.content ?? [])
      .filter((c) => c.type === 'text' && c.text)
      .map((c) => c.text);

    return texts.length === 1 ? texts[0] : texts.length > 0 ? texts.join('\n') : result;
  }

  /**
   * Disconnect and kill the MCP server process.
   */
  disconnect(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  // ── Private ─────────────────────────────────────────────────────

  private request(method: string, params: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pendingRequests.set(id, { resolve, reject });

      const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
      this.process?.stdin?.write(msg, (err) => {
        if (err) {
          this.pendingRequests.delete(id);
          reject(err);
        }
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`MCP request ${method} timed out`));
        }
      }, 30_000);
    });
  }

  private notify(method: string, params: Record<string, unknown>): void {
    const msg = JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n';
    this.process?.stdin?.write(msg);
  }
}
