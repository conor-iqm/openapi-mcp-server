#!/usr/bin/env node

import { Command } from 'commander';
import { OpenAPIMCPServer } from './server';
import fs from 'fs';
import path from 'path';

const program = new Command();

program
  .name('openapi-mcp-server')
  .description('Expose any REST API as MCP server based on OpenAPI schema')
  .version('1.0.0')
  .requiredOption('-s, --schema <path>', 'Path to OpenAPI schema file (JSON or YAML)')
  .option('-b, --base-url <url>', 'Override base URL from schema')
  .option('-h, --headers <headers>', 'Additional headers as JSON string')
  .parse();

const options = program.opts();

async function main() {
  try {
    // Read and validate schema file
    const schemaPath = path.resolve(options.schema);
    if (!fs.existsSync(schemaPath)) {
      console.error(`Schema file not found: ${schemaPath}`);
      process.exit(1);
    }

    // Parse additional headers if provided
    let additionalHeaders = {};
    if (options.headers) {
      try {
        additionalHeaders = JSON.parse(options.headers);
      } catch (error) {
        console.error('Invalid headers JSON:', error);
        process.exit(1);
      }
    }

    // Create and start the MCP server
    const server = new OpenAPIMCPServer(schemaPath, {
      baseUrl: options.baseUrl,
      additionalHeaders
    });

    await server.start();
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();