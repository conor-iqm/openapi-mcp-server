# OpenAPI MCP Server

This application exposes any REST API as an MCP (Model Context Protocol) server based on its OpenAPI schema. It automatically generates MCP tools from OpenAPI operations, supporting JSON payloads.

## Features

- Parse OpenAPI 3.0+ schemas (JSON and YAML formats)
- Automatically generate MCP tools from API operations
- Support for path, query, and header parameters
- JSON request body support
- Configurable base URLs and headers
- Error handling and validation

## Installation

```bash
npm install
npm run build
```

## Usage

```bash
npm start -- --schema <path-to-openapi-schema> [options]
```

### Options

- `-s, --schema <path>` - Path to OpenAPI schema file (JSON or YAML) **[Required]**
- `-b, --base-url <url>` - Override base URL from schema
- `-h, --headers <headers>` - Additional headers as JSON string

### Examples

```bash
# Basic usage with a local schema file
npm start -- --schema ./api-schema.yaml

# Override base URL
npm start -- --schema ./api-schema.json --base-url https://api.example.com

# Add authentication headers
npm start -- --schema ./api-schema.yaml --headers '{"Authorization": "Bearer your-token"}'
```

## Adding to Claude Desktop

To use this MCP server with Claude Desktop, you need to add it to your Claude Desktop configuration file.

### Configuration File Location

The configuration file is located at:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

### Configuration Steps

1. **Build the server** (if you haven't already):
   ```bash
   npm install
   npm run build
   ```

2. **Open or create the Claude Desktop configuration file** at the location above.

3. **Add the MCP server configuration**:
   ```json
   {
     "mcpServers": {
       "openapi-server": {
         "command": "node",
         "args": [
           "/path/to/your/openapi-mcp-server/dist/index.js",
           "--schema",
           "/path/to/your/openapi-schema.yaml"
         ]
       }
     }
   }
   ```

4. **Replace the paths** with your actual paths:
   - Replace `/path/to/your/openapi-mcp-server/` with the full path to where you cloned/downloaded this project
   - Replace `/path/to/your/openapi-schema.yaml` with the full path to your OpenAPI schema file

### Example Configuration

Here's a complete example configuration file:

```json
{
  "mcpServers": {
    "xmpt-api": {
      "command": "node",
      "args": [
        "/Users/username/projects/openapi-mcp-server/dist/index.js",
        "--schema",
        "/Users/username/projects/openapi-mcp-server/xmpt.yaml",
        "--base-url",
        "https://service.xmpt.us",
        "--headers",
        "{\"Authorization\": \"Bearer your-api-token\"}"
      ]
    },
    "local-api": {
      "command": "node", 
      "args": [
        "/Users/username/projects/openapi-mcp-server/dist/index.js",
        "--schema",
        "/Users/username/projects/openapi-mcp-server/local-api.json"
      ]
    }
  }
}
```

### Configuration Options

When adding the server to Claude Desktop, you can use all the same command-line options:

- `--schema <path>` - Path to your OpenAPI schema file (required)
- `--base-url <url>` - Override the base URL from the schema
- `--headers <json>` - Add authentication or other headers as JSON string

### Restart Claude Desktop

After modifying the configuration file, restart Claude Desktop for the changes to take effect.

### Verification

Once configured and restarted, you should be able to use the API tools in your conversations with Claude. The tools will be automatically generated based on your OpenAPI schema.

## How it works

1. **Schema Loading**: Loads and validates OpenAPI 3.0+ schemas from JSON or YAML files
2. **Tool Generation**: Automatically creates MCP tools for each API operation
3. **Parameter Mapping**: Maps OpenAPI parameters to MCP tool input schemas
4. **Request Execution**: Executes HTTP requests using the provided parameters
5. **Response Handling**: Returns formatted responses including status, headers, and data

## Supported OpenAPI Features

- ✅ Path parameters
- ✅ Query parameters  
- ✅ Header parameters
- ✅ JSON request bodies
- ✅ Multiple HTTP methods (GET, POST, PUT, PATCH, DELETE, etc.)
- ✅ Operation descriptions and summaries
- ✅ Required parameter validation

## Limitations

- Only supports OpenAPI 3.0+ (Swagger 2.0 not supported)
- Only JSON payloads are supported (no form data, multipart, etc.)
- Cookie parameters are not supported
- Schema references ($ref) are treated as generic objects
- No authentication flow automation (use headers option for API keys/tokens)

## Development

```bash
# Development mode with auto-reload
npm run dev -- --schema ./example-schema.yaml

# Build only
npm run build
```

## License

MIT