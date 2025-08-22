import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { OpenAPISchemaLoader } from './schema-loader';
import { APIClient } from './api-client';
import { ToolGenerator } from './tool-generator';
import { OpenAPIV3 } from 'openapi-types';

export interface ServerOptions {
  baseUrl?: string;
  additionalHeaders?: Record<string, string>;
  timeout?: number;
}

export class OpenAPIMCPServer {
  private server: Server;
  private schemaLoader: OpenAPISchemaLoader;
  private apiClient: APIClient;
  private toolGenerator: ToolGenerator;
  private tools: Tool[] = [];

  constructor(private schemaPath: string, private options: ServerOptions = {}) {
    this.server = new Server(
      {
        name: 'openapi-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.schemaLoader = new OpenAPISchemaLoader();
    this.apiClient = new APIClient(this.options);
    this.toolGenerator = new ToolGenerator();

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // Handle tool listing
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: this.tools,
      };
    });

    // Handle tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      const tool = this.tools.find(t => t.name === name);
      if (!tool) {
        throw new Error(`Tool ${name} not found`);
      }

      try {
        const result = await this.apiClient.executeOperation(
          name,
          args || {}
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error executing ${name}: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  async start(): Promise<void> {
    try {
      // Load OpenAPI schema
      const schema = await this.schemaLoader.loadSchema(this.schemaPath);
      
      // Initialize API client with schema
      await this.apiClient.initialize(schema);
      
      // Generate MCP tools from OpenAPI operations
      this.tools = this.toolGenerator.generateTools(schema);

      // Start the server
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      
      console.error(`OpenAPI MCP Server started with ${this.tools.length} tools`);
    } catch (error) {
      console.error('Failed to start server:', error);
      throw error;
    }
  }
}