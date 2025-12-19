# File Upload Example: Creative API

This example demonstrates how to use the file upload feature with the Creative API endpoint.

## Setup

1. **Configure Claude Desktop**

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "creative-api": {
      "command": "node",
      "args": [
        "/path/to/openapi-mcp-server/dist/index.js",
        "--schema", "/path/to/Creative-API-2.json",
        "--base-url", "https://api.example.com",
        "--header", "Authorization=Bearer YOUR_TOKEN_HERE",
        "--header", "X-IAA-OW-ID=1"
      ]
    }
  }
}
```

2. **Restart Claude Desktop**

## Usage Scenarios

### Scenario 1: Upload Single Image Creative

**Preparation:**
1. Save your image to a local path, e.g., `/Users/yourname/Downloads/banner.jpg`

**Claude Conversation:**
```
You: Create an image creative using the file at /Users/yourname/Downloads/banner.jpg. 
     The creative name should be "Summer Campaign Banner", 
     click URL is https://example.com, 
     and dimensions are 728x90.

Claude: I'll create the image creative for you using the createCreatives tool.
```

**Behind the scenes, Claude calls:**
```json
{
  "name": "createCreatives",
  "arguments": {
    "body": {
      "creativeRequest": "{\"I001\":{\"creativeName\":\"Summer Campaign Banner\",\"platformCreativeTypeId\":11,\"creativeSourceType\":\"FILE\",\"creativeSource\":\"banner.jpg\",\"clickUrl\":\"https://example.com\",\"imageDetails\":{\"creativeWidth\":728,\"creativeHeight\":90}}}",
      "creativeFiles": [
        "/Users/yourname/Downloads/banner.jpg"
      ]
    }
  }
}
```

**The MCP server:**
1. Reads `/Users/yourname/Downloads/banner.jpg`
2. Creates multipart form data with:
   - `creativeRequest`: JSON metadata
   - `creativeFiles`: The actual image file
3. Uploads to the API

### Scenario 2: Upload Multiple Video Creatives

**Preparation:**
1. Save videos to local paths:
   - `/Users/yourname/Videos/intro.mp4`
   - `/Users/yourname/Videos/outro.mp4`

**Claude Conversation:**
```
You: Create two video creatives:
     1. "Intro Video" using /Users/yourname/Videos/intro.mp4, 15 seconds, 1920x1080
     2. "Outro Video" using /Users/yourname/Videos/outro.mp4, 10 seconds, 1920x1080
     Both should link to https://example.com

Claude: I'll create both video creatives using the createCreatives tool.
```

**Behind the scenes:**
```json
{
  "name": "createCreatives",
  "arguments": {
    "body": {
      "creativeRequest": "{\"V001\":{\"creativeName\":\"Intro Video\",\"platformCreativeTypeId\":14,\"creativeSourceType\":\"FILE\",\"creativeSource\":\"intro.mp4\",\"clickUrl\":\"https://example.com\",\"videoDetails\":{\"duration\":15,\"creativeWidth\":1920,\"creativeHeight\":1080}},\"V002\":{\"creativeName\":\"Outro Video\",\"platformCreativeTypeId\":14,\"creativeSourceType\":\"FILE\",\"creativeSource\":\"outro.mp4\",\"clickUrl\":\"https://example.com\",\"videoDetails\":{\"duration\":10,\"creativeWidth\":1920,\"creativeHeight\":1080}}}",
      "creativeFiles": [
        "/Users/yourname/Videos/intro.mp4",
        "/Users/yourname/Videos/outro.mp4"
      ]
    }
  }
}
```

### Scenario 3: Native Image Creative with Brand Icon

**Preparation:**
1. Main image: `/Users/yourname/images/product.jpg`
2. Brand icon: Already uploaded, use URL

**Claude Conversation:**
```
You: Create a native image creative:
     - Image file: /Users/yourname/images/product.jpg
     - Title: "New Product Launch"
     - Description: "Check out our latest product"
     - Brand name: "MyBrand"
     - Brand icon URL: https://cdn.example.com/brand-icon.png
     - Click URL: https://example.com/product

Claude: I'll create the native image creative with those details.
```

**Behind the scenes:**
```json
{
  "name": "createCreatives",
  "arguments": {
    "body": {
      "creativeRequest": "{\"NI001\":{\"creativeName\":\"native-image\",\"platformCreativeTypeId\":15,\"subMediaType\":\"image\",\"creativeSourceType\":\"FILE\",\"creativeSource\":\"product.jpg\",\"clickUrl\":\"https://example.com/product\",\"nativeDetails\":{\"title\":\"New Product Launch\",\"description\":\"Check out our latest product\",\"brandName\":\"MyBrand\",\"brandIconSourceUrl\":\"https://cdn.example.com/brand-icon.png\"}}}",
      "creativeFiles": [
        "/Users/yourname/images/product.jpg"
      ]
    }
  }
}
```

## File Path Tips

### macOS/Linux
```bash
# Get absolute path of current directory
pwd

# Get absolute path of a file
realpath myfile.jpg

# Or use:
ls -la /path/to/file.jpg
```

### Windows (if using WSL or Git Bash)
```bash
# Get absolute path
readlink -f myfile.jpg
```

### Finding Files
```
You: I have a file called banner.jpg in my Downloads folder. 
     Can you help me create a creative with it?

Claude: I'll need the full path. On macOS, it's typically:
        /Users/[your-username]/Downloads/banner.jpg
        
        Could you confirm your username or provide the full path?

You: My username is john, so it's /Users/john/Downloads/banner.jpg

Claude: Perfect! I'll create the creative now...
```

## Common Patterns

### Pattern 1: Batch Upload with Metadata File

If you have multiple creatives with metadata in a JSON file:

```
You: I have 5 images in /Users/me/campaign/ (image1.jpg through image5.jpg).
     Create creatives for all of them with the name pattern "Campaign Ad {number}",
     click URL https://example.com, and dimensions 1200x628.

Claude: I'll create all 5 creatives in a single request...
```

### Pattern 2: URL-based vs File-based

The API supports both:
- `creativeSourceType: "FILE"` - Upload from local file
- `creativeSourceType: "URL"` - Use existing URL

```
You: Create a creative using this already-uploaded URL: 
     https://cdn.example.com/existing.jpg

Claude: Since you're providing a URL, I'll use creativeSourceType "URL" 
        and won't need to upload a file...
```

## Troubleshooting

### Error: "File not found"

```
You: Create a creative with /Users/me/image.jpg

Claude: I encountered an error: "File not found: /Users/me/image.jpg"

You: Oh, let me check... it's actually at /Users/me/Downloads/image.jpg

Claude: Thanks! Let me try again with the correct path...
```

### Error: "Path is not a file"

```
Claude: Error: "Path is not a file: /Users/me/Downloads"

You: Oops, I gave you the folder. The file is /Users/me/Downloads/image.jpg

Claude: Got it, creating the creative now...
```

## Best Practices

1. **Use Tab Completion**: When typing paths in terminal, use tab completion to avoid typos
2. **Verify Before Upload**: Check file exists and is the right one
3. **Organize Files**: Keep creatives in organized folders
4. **Use Descriptive Names**: Name files clearly (e.g., `campaign-summer-2024-banner.jpg`)

## Advanced: Scripting

You can prepare files and metadata programmatically:

```bash
#!/bin/bash
# prepare-creatives.sh

# Move files to known location
cp ~/messy-folder/*.jpg ~/creatives/batch-1/

# Generate file list
ls ~/creatives/batch-1/*.jpg > files.txt

# Now tell Claude:
# "Create creatives for all files listed in /Users/me/creatives/batch-1/"
```

## API Response

After successful upload, the API returns:

```json
{
  "success": true,
  "data": {
    "successData": {
      "I001": "701520",
      "V001": "701521"
    },
    "failedData": {}
  }
}
```

Claude will report:
```
Successfully created 2 creatives:
- I001: Creative ID 701520
- V001: Creative ID 701521
```

## Summary

Using file uploads with Claude Desktop is straightforward:

1. **Prepare**: Save files locally, note their absolute paths
2. **Ask**: Tell Claude what you want to create and where the files are
3. **Verify**: Claude confirms the operation
4. **Done**: Files are uploaded and creatives created

The MCP server handles all the complexity of file reading, encoding, and multipart form submission automatically!
