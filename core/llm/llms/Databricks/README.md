# Databricks LLM Integration for Continue

This directory contains the implementation for connecting Continue VS Code extension to Databricks LLM services, particularly Claude 3.7 Sonnet. It enables access to Databricks-hosted models for code completion, explanation, refactoring, and other features within the Continue extension.

## Databricks-Specific Limitations

### API Parameter Differences for Claude's Thinking Mode

**IMPORTANT**: Databricks endpoints have specific requirements for Claude's thinking mode implementation that differ from direct Anthropic API calls. The key differences are:

1. **Parameter Placement**: When using REST API directly with Databricks, the `thinking` parameter must be placed at the root level of the request, not within `extra_body`
2. **Model Names**: Require a `databricks-` prefix (e.g., `databricks-claude-3-7-sonnet` instead of `claude-3-7-sonnet-20240219`)
3. **Parameter Exclusion**: When disabling thinking mode, the `budget_tokens` parameter must be completely excluded (partial settings are not allowed)

#### REST API vs OpenAI Compatible Client

There are two ways to implement thinking mode for Databricks endpoints:

```typescript
// 1. Direct REST API approach (RECOMMENDED) - thinking at root level
const requestBody = {
  model: "databricks-claude-3-7-sonnet",
  messages: [
    {"role": "user", "content": "量子コンピューティングについて説明してください"}
  ],
  max_tokens: 20000,
  thinking: {
    type: "enabled",
    budget_tokens: 8000
  }
}

// 2. OpenAI compatible client approach - thinking inside extra_body
// NOTE: This approach may be rejected by some Databricks endpoints
const response = await client.chat.completions.create({
  model: "databricks-claude-3-7-sonnet",
  messages: [{"role": "user", "content": "量子コンピューティングについて説明してください"}],
  max_tokens: 20480,
  extra_body: {
    thinking: {
      type: "enabled",
      budget_tokens: 10240
    }
  }
});
```

**UPDATE (2025年5月)**: Our implementation now automatically extracts the `thinking` parameter from `extra_body` and places it at the root level of the request for Databricks compatibility. This handles both cases transparently:

- If the thinking parameter is provided in `extra_body`, it's extracted and placed at the root level
- If the thinking parameter is already at the root level, it's maintained as is
- All unnecessary parameters are filtered out before sending the request to Databricks

### About the `parallel_tool_calls` and `extra_body` Parameters

**IMPORTANT**: Databricks endpoints have two key parameter limitations:

1. **No Support for `parallel_tool_calls`**: This parameter (used by other providers like OpenAI) is not supported by Databricks endpoints and will cause errors.

2. **Special Handling for `extra_body`**: Databricks endpoints may reject requests with `extra_body` as a top-level parameter. Instead, the contents of `extra_body` need to be extracted and placed at the root level of the request.

The following measures have been implemented to address these issues:

1. **Exclusion at Type Definition Level**: We've intentionally excluded unsupported parameters from the `DatabricksCompletionOptions` and `DatabricksLLMOptions` interfaces to ensure type safety

2. **Intelligent Parameter Processing**: Modified `DatabricksHelpers.convertArgs()` to:
   - Avoid setting `parallel_tool_calls` parameter
   - Extract contents from `extra_body` (particularly `thinking` parameter) and place them at the root level
   - Handle all parameter transformations transparently

3. **Safe Access and Detailed Logging**: 
   - Modified to access tool information directly from properly typed `args` object
   - Added comprehensive logging for request parameters
   - Improved error detection for unsupported parameters

4. **Multiple Validation Layers**:
   - Final validation before sending requests to ensure clean parameters
   - Automatic correction of problematic parameters when possible
   - Detailed error reporting when invalid parameters are detected

These enhancements ensure reliable communication with Databricks endpoints while maintaining compatibility with different client approaches.

### Debugging and Logging Best Practices

**IMPORTANT**: To prevent issues with `[object Object]` appearing in the debug logs for the Databricks module, follow these best practices:

1. **Always Stringify Objects When Logging**:
   ```typescript
   // Bad - will show [object Object]
   console.log(`Tool info:`, tool);
   
   // Good - properties will be properly displayed
   import { safeStringify } from "../../utils/json.js";
   console.log(`Tool info:`, safeStringify(tool, "<invalid>"));
   ```

2. **Safe Access to Object Properties**:
   ```typescript
   // Bad - may error if property doesn't exist
   const toolName = tool.function.name;
   
   // Good - null-safe with optional chaining
   const toolName = tool?.function?.name || "<unnamed>";
   ```

3. **Exception Handling for Debug Logs**:
   ```typescript
   // Exception handling for debug logging
   try {
     // Tool name logging etc.
     const toolNames = args.tools
       .map((t: any) => t?.function?.name || 'unnamed')
       .join(', ');
     console.log(`Tool names: ${toolNames}`);
   } catch (e) {
     console.log(`Error while logging: ${getErrorMessage(e)}`);
   }
   ```

4. **Improved Request Body Logging**:
   ```typescript
   // Safe request body logging
   const truncatedBody = {
     model: requestBody.model,
     tools_count: requestBody.tools?.length || 0,
     messages_count: requestBody.messages?.length || 0
   };
   console.log('Request summary:', safeStringify(truncatedBody, "{}"));
   ```

5. **Detailed Logging in Development Mode**:
   ```typescript
   // Only output detailed logs in development mode
   if (process.env.NODE_ENV === 'development') {
     // Detailed information logging
   }
   ```

These best practices prevent `[object Object]` issues in logs and ensure more useful information is being logged.

### Thinking Mode Parameters and Processing

#### Request Parameters for Thinking Mode

To enable thinking mode for Claude 3.7 Sonnet models, the following parameters need to be set properly:

```typescript
// Correct structure for Databricks REST API
{
  "model": "databricks-claude-3-7-sonnet",
  "messages": [ /* messages */ ],
  "max_tokens": 20000,
  "thinking": {
    "type": "enabled",
    "budget_tokens": 8000  // Must be less than max_tokens
  }
}
```

**Key Constraints**:
- `budget_tokens` should be smaller than `max_tokens`
- Minimum recommended value is 1,024 tokens
- For complex reasoning tasks, at least 4,000 tokens is recommended
- Values larger than 32K may not result in better performance

#### Response Processing for Thinking Mode

Claude 3.7 Sonnet's thinking mode can return data in multiple different formats. In streaming mode, this thinking data may be sent in various formats:

1. Directly sent as a `thinking` property
2. Sent in `choices[0].delta.content.summary.text` format (most common for Databricks endpoints)
3. Sent in `content.summary.text` format
4. Sent in `summary.text` format
5. Sent in `reasoning` object or string format (Databricks-specific alternative)

To handle these potentially variable formats, we've updated the code to focus exclusively on the most reliable format: `choices[0].delta.content.summary.text`. This simplifies the processing and improves type safety. The updated implementation:

```typescript
// 思考モード処理 - choices[0].delta.content.summary.text形式のみを優先的に処理
if (chunk.choices && 
    Array.isArray(chunk.choices) && 
    chunk.choices.length > 0 && 
    chunk.choices[0]?.delta?.content) {
  
  const content = chunk.choices[0].delta.content;
  
  // オブジェクト型かつsummaryプロパティがある場合
  if (this.isContentObject(content) && 
      content.summary && 
      typeof content.summary === 'object' && 
      content.summary.text) {
    
    // 思考メッセージを作成
    const thinkingMessage: ThinkingChatMessage = {
      role: "thinking",
      content: content.summary.text,
      signature: chunk.choices[0].delta.signature || undefined
    };
    
    // 処理結果に思考メッセージを設定
    result.thinkingMessage = thinkingMessage;
    
    // 処理を完了して結果を返す
    return result;
  }
}
```

This approach uses a type guard function to ensure type safety:

```typescript
/**
 * contentがオブジェクト型かどうかを判定する型ガード関数
 */
private static isContentObject(content: any): content is { summary?: { text?: string } } {
  return typeof content === 'object' && content !== null;
}
```

### Solving the `[object Object]` Display Problem

The `[object Object]` display problem occurs due to the interaction between TypeScript's type system and JavaScript's object stringification. It's resolved using the following approaches:

1. **Flexible Type Definitions**: Enhanced `ThinkingChunk` interface to accommodate various data structures
2. **Type Guard Functions**: Added `isContentObject()` type guard for safe type checking
3. **Hierarchical Property Access**: Using optional chaining (`?.`) to safely extract text from all data formats
4. **Safe Stringification**: Using common utilities like `extractContentAsString` and `safeStringify` for safe stringification
5. **Appropriate Fallbacks**: Providing explicit fallback text when text can't be extracted via any method

Similar measures are applied when logging thinking processes:

```typescript
private static logThinkingProcess(thinkingMessage: ThinkingChatMessage): void {
  // Null check
  if (!thinkingMessage) {
    return;
  }
  
  try {
    // Use extractContentAsString to safely extract content
    const contentAsString = extractContentAsString(thinkingMessage.content) || "";
    
    // Add safe type checking
    if (contentAsString === undefined || contentAsString === null) {
      console.log('[Thinking Process] No data');
      return;
    }
    
    // Truncate long thinking process for display
    const truncatedThinking = contentAsString.length > 200 
      ? contentAsString.substring(0, 200) + '...' 
      : contentAsString;
    
    // Log as simple text to prevent [object Object] display
    console.log('[Thinking Process]', truncatedThinking);
  } catch (error) {
    // Skip logging errors to continue functionality
    console.log('[Thinking Process] データを処理中...');
  }
}
```

For thinking mode to work correctly, appropriate parameters must be set in the request:

```typescript
// For Databricks endpoint
finalOptions.extra_body = {
  thinking: {
    type: "enabled",
    budget_tokens: thinkingBudgetTokens,
  }
};
```

Note that thinking mode is only supported by Claude 3.7 Sonnet models.

## May 2025 Updates

### Parameter Handling Improvements

The May 2025 update includes several important improvements to parameter handling for Databricks endpoints:

1. **Intelligent `extra_body` Processing**: The implementation now automatically extracts parameters from `extra_body` and places them at the root level for Databricks compatibility
   - This handles both OpenAI-compatible client calls and direct REST API calls
   - Eliminates the `extra_body: Extra inputs are not permitted` error
   - Makes the implementation more robust and flexible

2. **Enhanced Debug Logging**: Improved logging for request parameters and response processing
   - Complete request body logging for better debugging
   - Detailed parameter tracking
   - Clear error messages for parameter issues

3. **Type-Safe Parameter Handling**: Better type definitions and handling of request parameters
   - Clearer type definitions for request options
   - Better error detection for unsupported parameters
   - Safer parameter transformation

### Thinking Mode Processing Enhancements

With the May 2025 update, we've also simplified thinking mode processing logic to focus exclusively on the `choices[0].delta.content.summary.text` format. This leads to several benefits:

1. **Improved Type Safety**: By focusing on one specific format with well-defined type guards, we avoid TypeScript compilation errors
2. **Reduced Complexity**: The simplified approach makes the code easier to understand and maintain
3. **Better Error Resilience**: The focused approach is less prone to edge cases and error conditions
4. **More Predictable Behavior**: By standardizing on one format, the behavior is more consistent

### Type Guard Functions for Safe Property Access

Using type guard functions is crucial for type-safe code:

```typescript
// Type guard for safely checking object properties
private static isContentObject(content: any): content is { summary?: { text?: string } } {
  return typeof content === 'object' && content !== null;
}

// Using type guard and in operator for safe property access
if (this.isContentObject(content) && content.summary) {
  // Now TypeScript knows content is an object with a potentially defined summary property
  // ...
}
```

By using proper type guards and carefully structured conditional checks, we ensure TypeScript correctly narrows types and prevents "Property does not exist on type 'never'" errors, which commonly happen when TypeScript loses track of an object's structure in complex conditionals.

## JSON Processing for Streaming Content

When working with streaming JSON data, the implementation uses various techniques to handle partial or malformed JSON. For Databricks endpoints with Claude 3.7 Sonnet's thinking mode, additional complexity arises due to nested JSON structure. These issues are addressed with:

1. **JSON Buffer Management**: Accumulating JSON fragments to reconstruct complete objects
2. **Delta-based JSON Processing**: Using `processJsonDelta` to incrementally build JSON objects
3. **JSON Validation and Repair**: Techniques for validating and repairing malformed JSON

## Configuration

To use the Databricks integration, the following configuration is needed:

1. **API Base URL**: The connection URL to the Databricks endpoint
2. **API Key**: The Databricks API key for authentication

These can be configured in the `config.yaml` file:

```yaml
models:
  - name: "databricks-claude"
    provider: "databricks"
    apiBase: "https://your-databricks-endpoint.cloud.databricks.com/serving-endpoints/claude-3-7-sonnet/invocations"
    apiKey: "dapi_your_api_key_here"
    model: "databricks-claude-3-7-sonnet"
```

**Important Notes**:
- The API base URL must always end with `/invocations`. The implementation will automatically normalize URLs by adding this suffix if missing.
- You can verify URL configuration in the console logs, which show the URL transformation via `DatabricksConfig.normalizeApiUrl` and `DatabricksConfig.getFullApiEndpoint`.
- If you're seeing `extra_body: Extra inputs are not permitted` errors, check that you're using the latest implementation that correctly handles parameter extraction.

## Claude 3.7 Sonnet Thinking Mode Configuration

Claude 3.7 Sonnet models support thinking mode, which provides more detailed step-by-step reasoning. To enable this mode, configure as follows:

```yaml
models:
  - name: "databricks-claude"
    provider: "databricks"
    apiBase: "https://your-databricks-endpoint.cloud.databricks.com/serving-endpoints/claude-3-7-sonnet/invocations"
    apiKey: "dapi_your_api_key_here"
    model: "databricks-claude-3-7-sonnet"
    completionOptions:
      thinking:
        type: "enabled"
        budget_tokens: 50000  # Optional: specify token budget (default is half of max_tokens)
```

Thinking mode is automatically detected and always enabled for Claude 3.7 models. When the model name includes "claude-3-7", the following special processing occurs:

1. **Thinking Mode Activation**: `thinking: { type: "enabled", budget_tokens: <budget> }` is added to the request
2. **Temperature Fixing**: The temperature parameter is fixed at 1.0 for optimal thinking mode performance
3. **Automatic Token Budget Calculation**: If not explicitly specified, half of `max_tokens` (up to 64000) is allocated as the token budget for the thinking process

This configuration allows Claude 3.7 Sonnet to display more detailed thinking processes and generate higher quality responses.

## Type-safe JSON Access and "choices" Property Error Solution

When working with Databricks endpoints, you may encounter the error: "Property 'choices' does not exist on type 'never'". This happens when TypeScript can't correctly understand the API response type. To solve this:

### 1. Type Guard + Validation for Safe LLM Response Processing

```typescript
// Define API response type
interface DatabricksClaudeResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
    thinking?: string;
  }>;
}

// Type guard function
function isValidClaudeResponse(response: any): response is DatabricksClaudeResponse {
  return (
    response &&
    Array.isArray(response.choices) &&
    response.choices.length > 0
  );
}

// Safe access approach
async function getCompletionWithThinking() {
  const response = await fetchFromAPI();
  
  if (isValidClaudeResponse(response)) {
    // Type-safe access now possible
    const thinking = response.choices[0]?.thinking || '';
    const content = response.choices[0]?.message?.content || '';
    return { thinking, content };
  }
  
  throw new Error('Invalid API response');
}
```

### 2. Optional Chaining and Nullish Coalescing

```typescript
// Use optional chaining (?.) and nullish coalescing (??) for safe access
const thinking = response?.choices?.[0]?.thinking ?? '';
const content = response?.choices?.[0]?.message?.content ?? 'No response content';
```

## Troubleshooting

### If `extra_body: Extra inputs are not permitted` Errors Occur

This error occurs when the Databricks endpoint does not recognize the `extra_body` parameter. With the May 2025 update, this error should be resolved automatically as the implementation now extracts parameters from `extra_body` and places them at the root level.

If you still encounter this error:

1. Ensure you're using the latest implementation with the May 2025 updates
2. Check that the `DatabricksHelpers.convertArgs()` method correctly processes the `extra_body` parameter
3. Enable detailed debug logging to see the exact request being sent

```yaml
# Enable debug logging (add to config.yaml)
debug: true
```

### If parallel_tool_calls Errors Occur

If you see error messages like this in the error logs:

```
Property 'tools' does not exist on type '{ messages: any[]; system: string; }'
```

Check the following:

1. Whether you're using the latest code version (with May 2025 updates applied)
2. Whether `Databricks.ts` file is using `args.tools` instead of `requestBody.tools`
3. Whether `DatabricksHelpers.convertArgs()` method is properly removing the `parallel_tool_calls` parameter

### If `[object Object]` is Displayed

If `[object Object]` appears in the console logs, proper object stringification is needed:

1. Use `safeStringify` function to log objects
2. Add checks for safe access to object properties
3. Add try-catch blocks around logging code

See the "Debugging and Logging Best Practices" section for details.

For thinking data processing issues, also check:

1. **Proper Thinking Data Format Detection**: Whether `StreamingProcessor.processChunk` method correctly detects thinking data
2. **Appropriate Thinking Data Extraction**: Whether thinking data is properly extracted
3. **Thinking Data Format**: Check the actual thinking data format returned from the Databricks endpoint (check console logs)

### Type Definition Issues

If TypeScript compilation errors occur, check:

1. **Type Guards**: Ensure proper type guard functions are used to safely check object properties
2. **Optional Chaining**: Use optional chaining (`?.`) and nullish coalescing (`??`) operators for safe property access
3. **ContentObject Pattern**: Use the `isContentObject` type guard for safely checking object properties
4. **Content Extraction**: Use `extractContentAsString` to safely handle `MessageContent` type, which can be string or object

## Implementation Details

### Parameter Processing Flow

The implementation follows a clear processing flow for handling parameters:

1. **Parameter Collection**: Gather parameters from user options
2. **Parameter Transformation**: Transform parameters to match Databricks requirements:
   - For thinking mode: Extract from `extra_body` if present, or construct from default values
   - For tools: Process and validate tool definitions
   - For unsupported parameters: Remove parameters not supported by Databricks
3. **Parameter Validation**: Ensure all parameters are valid and properly formatted
4. **Request Construction**: Build the final request with properly structured parameters
5. **Error Handling**: Handle error responses with detailed information

This approach ensures robust communication with Databricks endpoints while maintaining compatibility with different client approaches.

## Future Improvement Plans

1. **Performance Optimization**: Further optimize request processing and response parsing performance
2. **Improved Buffer Management**: More efficient JSON buffer management for improved stability in large streaming
3. **Enhanced Context Management**: Improved context management considering token limits
4. **Increased Type Safety**: Stricter type definitions and checks for improved safety
5. **Enhanced Error Handling**: More detailed error analysis and automatic recovery
6. **Documentation Improvements**: Enhanced user documentation and in-code comments
7. **Support for New Features**: Support for future Claude 3.7/3.8 features
8. **Performance Metrics Collection**: Detailed performance measurement and metrics collection for optimization
9. **Expanded Automated Testing**: More comprehensive automated testing for quality assurance

This modularized architecture significantly improves the extension's stability and maintainability, making it easier to adapt to future API changes. The May 2025 improvements have resolved parameter handling issues, improved type safety and common utility usage. Most importantly, both the `extra_body` parameter processing and Claude 3.7 Sonnet's thinking mode are now correctly handled with a more focused approach, eliminating previous errors and display issues.