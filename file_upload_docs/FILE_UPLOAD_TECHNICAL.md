# File Upload Implementation - Technical Reference

This document provides technical details for developers working with or extending the file upload functionality.

## Architecture

### Components

1. **ToolGenerator** (`src/tool-generator.ts`)
   - Detects file upload fields in OpenAPI schemas
   - Transforms binary format fields to accept file paths
   - Generates appropriate tool input schemas

2. **APIClient** (`src/api-client.ts`)
   - Reads files from provided paths
   - Creates multipart/form-data requests
   - Handles file streaming and MIME type detection

### Detection Logic

File upload fields are detected based on:

```typescript
private isFileUploadSchema(schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject): boolean {
  // 1. Direct binary format
  if (schema.format === 'binary') return true;
  
  // 2. Array of binary items
  if (schema.type === 'array' && schema.items?.format === 'binary') return true;
  
  // 3. References are resolved recursively
  if ('$ref' in schema) {
    const resolved = this.resolveReference(schema.$ref);
    if (resolved) return this.isFileUploadSchema(resolved);
  }
  
  return false;
}
```

### Schema Transformation

Binary schemas are transformed to accept file paths:

```typescript
// Original OpenAPI schema
{
  "type": "string",
  "format": "binary",
  "description": "File to upload"
}

// Transformed MCP tool schema
{
  "type": "string",
  "description": "Absolute file path to upload. File to upload"
}
```

For arrays:
```typescript
// Original
{
  "type": "array",
  "items": {
    "type": "string",
    "format": "binary"
  }
}

// Transformed
{
  "type": "array",
  "items": {
    "type": "string",
    "description": "Absolute file path to upload"
  },
  "description": "Array of file paths to upload. [original description]"
}
```

## Request Processing Flow

### 1. Tool Invocation

```typescript
{
  "name": "createCreatives",
  "arguments": {
    "body": {
      "metadata": "{...}",
      "files": ["/path/to/file1.jpg", "/path/to/file2.png"]
    }
  }
}
```

### 2. Content Type Detection

```typescript
private determineContentType(requestBody: OpenAPIV3.RequestBodyObject): string | undefined {
  const contentTypes = Object.keys(requestBody.content || {});
  
  // Priority: JSON > XML > form-urlencoded > multipart/form-data > others
  if (contentTypes.includes('multipart/form-data')) return 'multipart/form-data';
  // ...
}
```

### 3. Multipart Processing

```typescript
async processMultipartFormData(body: any, requestBody?: OpenAPIV3.RequestBodyObject): Promise<FormData> {
  const formData = new FormData();
  const schema = this.getRequestBodySchema(requestBody, 'multipart/form-data');
  
  for (const [key, value] of Object.entries(body)) {
    const fieldSchema = schema?.properties[key];
    const isFile = this.isFileField(fieldSchema);
    
    if (isFile) {
      // Handle file upload
      await this.appendFileToFormData(formData, key, value);
    } else {
      // Handle regular field
      formData.append(key, processValue(value));
    }
  }
  
  return formData;
}
```

### 4. File Reading

```typescript
async appendFileToFormData(formData: FormData, fieldName: string, filePath: string): Promise<void> {
  // Validate file exists
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  
  // Create read stream
  const fileStream = fs.createReadStream(filePath);
  const fileName = path.basename(filePath);
  
  // Append with MIME type
  formData.append(fieldName, fileStream, {
    filename: fileName,
    contentType: this.getMimeType(filePath)
  });
}
```

### 5. HTTP Request

```typescript
const config: AxiosRequestConfig = {
  method: 'POST',
  url: apiUrl,
  data: formData,
  headers: {
    ...baseHeaders,
    ...formData.getHeaders()  // Includes Content-Type with boundary
  }
};

const response = await this.client.request(config);
```

## MIME Type Detection

```typescript
private getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  
  const mimeTypes: Record<string, string> = {
    // Images
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    
    // Videos
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    
    // Audio
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    
    // Documents
    '.pdf': 'application/pdf',
    '.json': 'application/json',
    '.xml': 'text/xml',
    '.txt': 'text/plain',
    
    // Default
    default: 'application/octet-stream'
  };
  
  return mimeTypes[ext] || mimeTypes.default;
}
```

## Error Handling

### File Not Found
```typescript
if (!fs.existsSync(filePath)) {
  throw new Error(`File not found: ${filePath}`);
}
```

### Not a File
```typescript
const stats = fs.statSync(filePath);
if (!stats.isFile()) {
  throw new Error(`Path is not a file: ${filePath}`);
}
```

### Invalid Type
```typescript
if (typeof filePath !== 'string') {
  throw new Error(`File path must be a string, got: ${typeof filePath}`);
}
```

## Testing

### Unit Tests

Test file upload detection:
```typescript
it('should detect binary format fields as file uploads', () => {
  const schema = {
    type: 'object',
    properties: {
      file: { type: 'string', format: 'binary' }
    }
  };
  
  const tool = generator.generateTools(schema);
  const fileField = tool.inputSchema.properties.body.properties.file;
  
  expect(fileField.description).toContain('file path');
});
```

Test schema transformation:
```typescript
it('should transform array of binary files', () => {
  const schema = {
    files: {
      type: 'array',
      items: { type: 'string', format: 'binary' }
    }
  };
  
  const tool = generator.generateTools(schema);
  expect(tool.inputSchema.properties.body.properties.files.type).toBe('array');
  expect(tool.inputSchema.properties.body.properties.files.items.description)
    .toContain('file path');
});
```

### Integration Tests

Test complete flow:
```typescript
it('should process multipart form data with file uploads', async () => {
  const tempFile = '/tmp/test.jpg';
  fs.writeFileSync(tempFile, 'test content');
  
  const client = new APIClient({ baseUrl: 'http://localhost' });
  await client.initialize(schema);
  
  // This would make actual HTTP call in real scenario
  const operations = client.getOperations();
  expect(operations.has('uploadFile')).toBe(true);
  
  fs.unlinkSync(tempFile);
});
```

## Extension Points

### Adding New MIME Types

Edit `getMimeType()` in `api-client.ts`:

```typescript
private getMimeType(filePath: string): string {
  const mimeTypes: Record<string, string> = {
    // Add your custom types
    '.heic': 'image/heic',
    '.flac': 'audio/flac',
    // ...
  };
  // ...
}
```

### Custom File Validation

Add validation before file reading:

```typescript
private async appendFileToFormData(
  formData: FormData, 
  fieldName: string, 
  filePath: string
): Promise<void> {
  // Existing validation
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  
  const stats = fs.statSync(filePath);
  if (!stats.isFile()) {
    throw new Error(`Path is not a file: ${filePath}`);
  }
  
  // Add custom validation
  const maxSize = 100 * 1024 * 1024; // 100MB
  if (stats.size > maxSize) {
    throw new Error(`File too large: ${filePath} (${stats.size} bytes, max ${maxSize})`);
  }
  
  // Validate file extension
  const allowedExtensions = ['.jpg', '.png', '.mp4'];
  const ext = path.extname(filePath).toLowerCase();
  if (!allowedExtensions.includes(ext)) {
    throw new Error(`Unsupported file type: ${ext}`);
  }
  
  // Continue with upload
  // ...
}
```

### Supporting Remote URLs

Extend to download and upload remote files:

```typescript
private async appendFileToFormData(
  formData: FormData,
  fieldName: string,
  filePathOrUrl: string
): Promise<void> {
  let fileStream: fs.ReadStream | Stream;
  let fileName: string;
  let contentType: string;
  
  if (filePathOrUrl.startsWith('http://') || filePathOrUrl.startsWith('https://')) {
    // Download from URL
    const response = await axios.get(filePathOrUrl, { responseType: 'stream' });
    fileStream = response.data;
    fileName = path.basename(new URL(filePathOrUrl).pathname);
    contentType = response.headers['content-type'] || 'application/octet-stream';
  } else {
    // Read from local file
    if (!fs.existsSync(filePathOrUrl)) {
      throw new Error(`File not found: ${filePathOrUrl}`);
    }
    fileStream = fs.createReadStream(filePathOrUrl);
    fileName = path.basename(filePathOrUrl);
    contentType = this.getMimeType(filePathOrUrl);
  }
  
  formData.append(fieldName, fileStream, {
    filename: fileName,
    contentType: contentType
  });
}
```

## Performance Considerations

### Streaming

Files are streamed rather than loaded into memory:
```typescript
// Uses streams - memory efficient
const fileStream = fs.createReadStream(filePath);
formData.append(fieldName, fileStream);

// Don't do this - loads entire file into memory
const fileBuffer = fs.readFileSync(filePath);  // ❌
formData.append(fieldName, fileBuffer);
```

### Concurrent Uploads

Multiple files are read concurrently when building FormData:
```typescript
// Files are read as streams and appended immediately
for (const filePath of filePaths) {
  await this.appendFileToFormData(formData, key, filePath);
}
// Actual upload happens once, with all files
```

### Memory Usage

- Files are not loaded into memory
- Stream buffers are managed by Node.js
- FormData manages boundaries efficiently
- Axios handles streaming upload

## Debugging

Enable debug logging:

```typescript
// In appendFileToFormData
console.log(`Uploading file: ${filePath}`);
console.log(`File size: ${stats.size} bytes`);
console.log(`MIME type: ${mimeType}`);
console.log(`Field name: ${fieldName}`);
```

Inspect FormData:
```typescript
const formData = await this.processMultipartFormData(body, requestBody);
console.log('FormData fields:', formData.getHeaders());
```

## Security Considerations

### Path Traversal

The current implementation does not restrict file paths. Consider adding:

```typescript
private validateFilePath(filePath: string): void {
  const resolvedPath = path.resolve(filePath);
  const allowedBasePath = path.resolve(process.env.ALLOWED_UPLOAD_DIR || '/tmp');
  
  if (!resolvedPath.startsWith(allowedBasePath)) {
    throw new Error(`Access denied: ${filePath}`);
  }
}
```

### File Type Validation

Add content-based validation (not just extension):

```typescript
import { fileTypeFromFile } from 'file-type';

const fileType = await fileTypeFromFile(filePath);
if (!fileType || !allowedMimeTypes.includes(fileType.mime)) {
  throw new Error(`Invalid file type: ${fileType?.mime}`);
}
```

## Dependencies

```json
{
  "dependencies": {
    "form-data": "^4.0.0",  // Multipart form data
    "axios": "^1.6.0"        // HTTP client (existing)
  },
  "devDependencies": {
    "@types/form-data": "^2.5.0"
  }
}
```

## API Surface

### ToolGenerator

```typescript
class ToolGenerator {
  // Public
  generateTools(schema: OpenAPIV3.Document): Tool[];
  
  // Private (for file uploads)
  private isFileUploadSchema(schema): boolean;
  private transformFileUploadSchema(schema, fieldName): ResolvedSchema;
}
```

### APIClient

```typescript
class APIClient {
  // Public
  async executeOperation(operationId: string, args: Record<string, any>): Promise<any>;
  
  // Private (for file uploads)
  private isFileField(schema: any): boolean;
  private async processMultipartFormData(body, requestBody?): Promise<FormData>;
  private async appendFileToFormData(formData, fieldName, filePath): Promise<void>;
  private getMimeType(filePath: string): string;
}
```

## Future Enhancements

1. **Progress Callbacks**: Report upload progress
2. **Retry Logic**: Automatic retry for failed uploads
3. **Compression**: Compress files before upload
4. **Validation**: Schema-based file validation
5. **Caching**: Cache file metadata for repeated uploads
6. **Chunked Upload**: Support for large file chunked uploads
