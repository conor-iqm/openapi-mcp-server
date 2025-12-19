# File Upload Support in OpenAPI MCP Server

This document explains how the OpenAPI MCP Server handles file uploads for endpoints that accept binary data through `multipart/form-data` requests.

## Overview

The MCP server now automatically detects file upload fields in your OpenAPI specification and transforms them to accept **file paths** as input. When you invoke a tool with file paths, the server:

1. Reads the files from the provided paths
2. Creates a proper `multipart/form-data` request
3. Uploads the files to your API endpoint

## How It Works

### 1. Schema Detection

The server automatically detects file upload fields by looking for:

- Fields with `format: binary` in the OpenAPI schema
- Arrays of items with `format: binary`
- Fields in `multipart/form-data` content type

### 2. Tool Schema Transformation

When generating MCP tools from your OpenAPI spec, file upload fields are transformed:

**Original OpenAPI Schema:**
```yaml
requestBody:
  content:
    multipart/form-data:
      schema:
        type: object
        properties:
          creativeFiles:
            type: array
            items:
              type: string
              format: binary
            description: "Files to upload"
```

**Generated MCP Tool Schema:**
```json
{
  "body": {
    "type": "object",
    "properties": {
      "creativeFiles": {
        "type": "array",
        "items": {
          "type": "string",
          "description": "Absolute file path to upload"
        },
        "description": "Array of file paths to upload. Files to upload"
      }
    }
  }
}
```

### 3. File Processing

When you call the tool with file paths, the server:

1. Validates each file path exists
2. Reads the files using Node.js streams
3. Determines MIME types based on file extensions
4. Creates a proper FormData object with files and metadata
5. Sends the multipart request to your API

## Usage Example

### Using with the Creative API

For the Creative API endpoint `/api/v3/crt/creatives`:

```javascript
// Claude Desktop calling the MCP tool
{
  "name": "createCreatives",
  "arguments": {
    "Authorization": "Bearer your-token",
    "X-IAA-OW-ID": 1,
    "body": {
      "creativeRequest": "{\"I001\":{\"creativeName\":\"image-file\",\"platformCreativeTypeId\":11,\"creativeSourceType\":\"FILE\",\"creativeSource\":\"product.jpg\",\"clickUrl\":\"www.example.com\"}}",
      "creativeFiles": [
        "/path/to/product.jpg"
      ]
    }
  }
}
```

The server will:
1. Read `/path/to/product.jpg`
2. Create a multipart form with:
   - `creativeRequest`: The JSON string
   - `creativeFiles`: The actual file content from the path
3. Send it to your API

### Multiple Files

For endpoints accepting multiple files:

```javascript
{
  "body": {
    "metadata": "{\"key\":\"value\"}",
    "files": [
      "/Users/username/image1.jpg",
      "/Users/username/image2.png",
      "/Users/username/video.mp4"
    ]
  }
}
```

## Supported File Types

The server automatically detects MIME types based on file extensions:

| Extension | MIME Type |
|-----------|-----------|
| .jpg, .jpeg | image/jpeg |
| .png | image/png |
| .gif | image/gif |
| .mp4 | video/mp4 |
| .webm | video/webm |
| .mp3 | audio/mpeg |
| .wav | audio/wav |
| .pdf | application/pdf |
| .json | application/json |
| .xml | text/xml |
| .txt | text/plain |
| *others* | application/octet-stream |

## Error Handling

The server provides clear error messages for common issues:

### File Not Found
```
Error: File not found: /path/to/missing-file.jpg
```

### Invalid Path (Directory)
```
Error: Path is not a file: /path/to/directory
```

### Invalid File Path Type
```
Error: File path must be a string, got: object
```

## Implementation Details

### Modified Components

1. **tool-generator.ts**
   - Added `isFileUploadSchema()` method to detect binary fields
   - Added `transformFileUploadSchema()` to convert binary schemas to file path inputs
   - Modified `resolveSchema()` to apply transformation to file fields

2. **api-client.ts**
   - Added `processMultipartFormData()` to handle file uploads
   - Added `appendFileToFormData()` to read and attach files
   - Added `getMimeType()` to determine content types
   - Modified `executeOperation()` to use FormData for multipart requests

### Dependencies

- **form-data**: For creating proper multipart/form-data requests
- **fs**: For reading files from the file system
- **path**: For handling file paths

## Best Practices

### 1. Use Absolute Paths
Always provide absolute file paths to avoid ambiguity:
```javascript
// Good
"/Users/username/Documents/image.jpg"

// Bad (relative paths may not work as expected)
"./image.jpg"
```

### 2. Validate Files Before Calling
Ensure files exist and are accessible before invoking the tool.

### 3. File Size Considerations
Large files will be streamed, but be mindful of:
- API endpoint upload limits
- Network timeouts (configure in server options)
- Memory constraints

### 4. Security
- Only provide paths to files you trust
- The server validates file existence but not content
- Your API should validate uploaded files server-side

## Troubleshooting

### Issue: "File not found" error
**Solution**: Verify the file path is correct and absolute. Check file permissions.

### Issue: Upload timeout
**Solution**: Increase timeout in server configuration:
```javascript
{
  "timeout": 60000  // 60 seconds
}
```

### Issue: MIME type incorrect
**Solution**: The server determines MIME type from extension. Ensure correct file extension or the API should handle MIME type detection server-side.

## Testing

Run the test suite to verify file upload functionality:

```bash
npm test -- file-upload.test.ts
```

The tests cover:
- Binary field detection
- Single file uploads
- Multiple file uploads
- Schema reference resolution
- Tool generation with file fields

## Example: Complete Flow

1. **OpenAPI Spec** (Creative-API-2.json):
```json
{
  "paths": {
    "/api/v3/crt/creatives": {
      "post": {
        "requestBody": {
          "content": {
            "multipart/form-data": {
              "schema": {
                "$ref": "#/components/schemas/CreateCreativeMultipartRequest"
              }
            }
          }
        }
      }
    }
  },
  "components": {
    "schemas": {
      "CreateCreativeMultipartRequest": {
        "properties": {
          "creativeRequest": { "type": "string" },
          "creativeFiles": {
            "type": "array",
            "items": { "type": "string", "format": "binary" }
          }
        }
      }
    }
  }
}
```

2. **Generated MCP Tool**: The tool will accept file paths for `creativeFiles`

3. **Claude Invocation**:
```javascript
{
  "name": "createCreatives",
  "arguments": {
    "body": {
      "creativeRequest": "{...}",
      "creativeFiles": ["/path/to/file.jpg"]
    }
  }
}
```

4. **Server Processing**:
   - Reads `/path/to/file.jpg`
   - Creates FormData with the file
   - Sends multipart request to API

5. **API Response**: Returns created creative IDs

## Summary

The file upload support is completely automatic. Simply:

1. Define your OpenAPI spec with `format: binary` fields
2. Generate tools from the spec
3. Call tools with **file paths** instead of file contents
4. The server handles all file reading and multipart encoding

No additional configuration or code required!
