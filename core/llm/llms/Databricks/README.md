# Databricks LLM Integration for Continue

This directory contains the implementation for connecting Continue VS Code extension to Databricks LLM services, particularly Claude 3.7 Sonnet. It enables access to Databricks-hosted models for code completion, explanation, refactoring, and other features within the Continue extension.

## Databricks-Specific Limitations

### API Parameter Differences for Claude's Thinking Mode

**IMPORTANT**: Databricks endpoints require different API parameter placement for Claude's thinking mode compared to direct Anthropic API calls. The key differences are:

1. Databricks requires the `thinking` parameter to be placed inside the `extra_body` object, not at the top level
2. Model names need a `databricks-` prefix (e.g., `databricks-claude-3-7-sonnet` instead of `claude-3-7-sonnet-20240219`)
3. When disabling thinking mode, the `budget_tokens` parameter must be completely excluded (partial settings are not allowed)

Example comparison:
```typescript
// Anthropic direct API
const response = await anthropicClient.messages.create({
  model: "claude-3-7-sonnet-20240219",
  thinking: {
    type: "enabled",
    budget_tokens: 10240
  },
  // Other parameters
});

// Databricks API
const response = await client.chat.completions.create({
  model: "databricks-claude-3-7-sonnet",
  // IMPORTANT: thinking parameter inside extra_body object
  extra_body: {
    thinking: {
      type: "enabled",
      budget_tokens: 10240
    }
  },
  // Other parameters
});
```

These parameter structure differences have been handled in the implementation to ensure compatibility with Databricks endpoints.

### About the `parallel_tool_calls` Parameter

**IMPORTANT**: Databricks endpoints do not support the `parallel_tool_calls` parameter. This parameter is used by other providers (like OpenAI) to process tool calls in parallel, but Databricks endpoints do not recognize this parameter and it may cause errors.

The following measures have been implemented to address this issue:

1. **Exclusion at Type Definition Level**: Intentionally excluded this parameter from the `DatabricksCompletionOptions` and `DatabricksLLMOptions` interfaces to ensure type safety
2. **Parameter Setting Avoidance**: Modified `DatabricksHelpers.convertArgs()` to avoid setting this parameter
3. **Safe Access**: Modified to access tool information directly from properly typed `args` object instead of `requestBody` object
4. **Detailed Logging**: Added detailed logging for tool-related processing to facilitate debugging
5. **Error Detection and Handling**: Enhanced error handling to detect and handle special error patterns
6. **Safe Value Checking and Removal**: Added final validation before sending requests to automatically remove the `parallel_tool_calls` parameter if present
7. **Multiple Lines of Defense**: Multiple checkpoints through `convertArgs()` and request body construction

These measures improve compatibility with Databricks endpoints for tool calling functionality and prevent errors.

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

### Thinking Mode Processing

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

## Type Safety and Reduced Complexity

With the May 2025 update, we've simplified thinking mode processing logic to focus exclusively on the `choices[0].delta.content.summary.text` format. This leads to several benefits:

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

Important: The API base URL must always end with `/invocations`. You can verify if the URL is correctly configured by checking the console logs, which show the URL transformation process via `DatabricksConfig.normalizeApiUrl` and `DatabricksConfig.getFullApiEndpoint`.

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

### If parallel_tool_calls Errors Occur

If you see error messages like this in the error logs:

```
Property 'tools' does not exist on type '{ messages: any[]; system: string; }'
```

Check the following:

1. Whether you're using the latest code version (with May 2025 updates applied)
2. Whether `Databricks.ts` file is using `args.tools` instead of `requestBody.tools`
3. Whether `DatabricksHelpers.convertArgs()` method is not setting the `parallel_tool_calls` parameter

If these issues persist, enable detailed debug logging to identify the problem:

```typescript
// Enable debug logging (add to config.yaml)
debug: true
```

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

This modularized architecture significantly improves the extension's stability and maintainability, making it easier to adapt to future API changes. The May 2025 improvements have resolved URL routing issues, improved type safety and common utility usage. Most importantly, Claude 3.7 Sonnet's thinking mode is now correctly processed with a more focused approach to handling the `choices[0].delta.content.summary.text` format, eliminating the previous [object Object] display issues.