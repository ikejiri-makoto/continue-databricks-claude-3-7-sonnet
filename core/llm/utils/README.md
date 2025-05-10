# Continue VS Code Extension - LLM Utility Modules

This directory contains utility modules that support the LLM integration functionality in the Continue VS Code extension. These utility files provide essential helper functions and tools for error handling, message processing, streaming, and JSON operations that are used throughout the LLM components.

## Directory Structure

```
core/llm/utils/
├── errors.ts       (エラー処理)
├── json.ts         (JSON処理)
├── messageUtils.ts (メッセージ処理)
├── sseProcessing.ts (SSE処理)
├── streamProcessing.ts (ストリーム処理)
├── toolUtils.ts     (ツールユーティリティ)
└── typeUtils.ts     (型安全性ユーティリティ)
```

## Core Utility Files

### `errors.ts`
Error handling utilities that:
- Define custom error types for LLM-related operations
- Provide standardized error handling patterns
- Help classify and respond to various error conditions from LLM providers

**Key functions:**
- `getErrorMessage(error: unknown): string` - Safely extracts error messages from various error types
- `isConnectionError(error: unknown): boolean` - Identifies network-related errors for retry decisions
- `LLMError` - Base class for all LLM-specific errors

### `json.ts`
JSON processing utilities that:
- Offer safe methods for parsing and stringifying JSON
- Handle edge cases and malformed JSON data
- Provide type-safe JSON operations for LLM responses
- Extract valid JSON from mixed content or streaming fragments
- Process incomplete JSON data in streaming contexts
- Implement delta-based JSON processing for Anthropic-style partial JSON updates
- Provide tools for detecting and repairing duplicated JSON patterns

**Key functions:**
- `safeStringify(obj: unknown, defaultValue?: string): string` - Converts objects to strings with error handling
- `isValidJson(text: string): boolean` - Validates if a string is valid JSON
- `safeJsonParse<T>(text: string, fallback?: T): T` - Safely parses JSON with type information
- `extractValidJson(text: string): string | null` - Extracts valid JSON from a string with extra content
- `processJsonFragment(fragment: string): any | null` - Processes partial JSON fragments in streams
- `deepMergeJson(target: any, source: any): any` - Recursively merges JSON objects with proper handling
- `extractJsonAndRemainder(text: string): [any, string] | null` - Extracts JSON and returns remaining content
- `processJsonDelta(currentJson: string, deltaJson: string): {combined: string; complete: boolean; valid: boolean}` - Processes JSON fragments using delta-based approach
- `repairDuplicatedJsonPattern(jsonStr: string): string` - Detects and repairs duplicated JSON patterns

### `messageUtils.ts`
Message processing utilities that:
- Convert between different message formats required by various LLM providers
- Extract and transform content from complex message structures
- Provide helpers for working with chat message histories
- Extract query contexts and relevant information from conversation history
- Validate tool result blocks in messages

**Key functions:**
- `extractContentAsString(content: any): string` - Safely extracts content as string from various formats
- `extractQueryContext(messages: any[]): string` - Extracts the main query context from a conversation
- `sanitizeMessages(messages: any[]): any[]` - Cleans messages for API consumption
- `hasToolResultBlocksAtBeginning(message: ChatMessage): boolean` - Checks if message starts with tool result blocks
- `messageHasToolCalls(message: ChatMessage): boolean` - Checks if message contains tool calls

### `sseProcessing.ts`
Server-Sent Events (SSE) processing utilities that:
- Parse and process SSE streams from LLM providers
- Handle event boundaries and formatting
- Provide mechanisms for working with streaming LLM responses

**Key functions:**
- `processSSEStream(response: Response): AsyncGenerator<any>` - Processes SSE streams from APIs
- `parseSSEChunk(chunk: string): Record<string, any>[]` - Parses SSE data chunks into structured objects

### `streamProcessing.ts`
Stream processing utilities that:
- Process streamed responses from LLM API calls
- Transform chunk-based responses into usable formats
- Manage stream state and error handling
- Provide utilities for combining and consuming streamed content
- Handle partial JSON fragments in streaming contexts
- Support delta-based JSON processing for streaming contexts

**Key functions:**
- `processContentDelta(currentContent: string, delta: string): string` - Handles incremental content updates
- `JsonBufferHelpers` - Utilities for buffering and processing partial JSON fragments in streams:
  - `addToBuffer(newData, currentBuffer, maxBufferSize)` - Adds data to buffer with size limiting
  - `resetBuffer()` - Resets the JSON buffer
  - `isBufferComplete(buffer)` - Checks if buffer contains complete valid JSON
  - `extractValidJsonFromBuffer(buffer)` - Extracts valid JSON from buffer
  - `extractJsonAndRemainder(buffer)` - Extracts JSON and returns remaining content
  - `safelyMergeJsonStrings(firstJson, secondJson)` - Safely merges two JSON strings
- `StreamProcessor` - Base class for provider-specific stream processors
- `JsonDeltaProcessor` - Utilities for processing JSON deltas in streaming contexts:
  - `processJsonDelta(currentJson, deltaJson)` - Processes partial JSON fragments using delta-based approach
  - `isDeltaComplete(delta)` - Checks if JSON delta represents a complete JSON object
  - `mergeDeltaWithCurrent(current, delta)` - Merges delta JSON with current buffer

### `toolUtils.ts`
Tool-related utilities that:
- Help identify and process tool calls in LLM responses
- Provide specialized handling for search and other common tools
- Format tool results for different providers
- Standardize tool result formats between providers
- Process tool arguments with support for delta-based JSON

**Key functions:**
- `isSearchTool(name: string): boolean` - Identifies if a tool is a search tool
- `processSearchToolArguments(name: string, args: string, context: string): string` - Processes search tool arguments
- `formatToolResultsContent(results: any): string` - Formats tool results in standardized format
- `doesModelSupportTools(provider: string, model: string): boolean` - Checks if a model supports tool functionality
- `isToolOfType(toolName: string, typePatterns: string[]): boolean` - Checks if a tool belongs to a specific category
- `repairToolArguments(args: string): string` - Repairs malformed JSON in tool arguments
- `processToolArgumentsDelta(args: string, delta: string): {processed: string, complete: boolean}` - Processes tool arguments using delta-based approach

### `typeUtils.ts`
Type safety utilities that:
- Provide helper functions for TypeScript type narrowing and validation
- Ensure null safety in complex code flows
- Offer reusable patterns for type-safe operations

**Key functions:**
- `asNumber(value: unknown): number` - Safely converts values to numbers with validation
- `isNonNullIndex(index: number | null): index is number` - Type guard for non-null indices
- `ensureValidIndex(index: unknown, arrayLength: number): number | null` - Validates array indices

## Enhanced Usage Patterns

The utility modules are designed to be used together to provide comprehensive support for LLM operations. Here are some common usage patterns that combine multiple utilities:

### JSON Processing in Streaming Contexts

```typescript
import { safeJsonParse, extractValidJson, processJsonDelta } from "./json";
import { JsonBufferHelpers } from "./streamProcessing";

// Accumulated buffer for JSON fragments
let buffer = JsonBufferHelpers.resetBuffer();

// Process incoming fragments
function processJsonFragment(fragment: string) {
  // Add new fragment to buffer with size limit
  buffer = JsonBufferHelpers.addToBuffer(fragment, buffer, 10000);
  
  // Check if buffer now contains valid JSON
  if (JsonBufferHelpers.isBufferComplete(buffer)) {
    // Extract and process the valid JSON
    const validJson = extractValidJson(buffer);
    if (validJson) {
      // Safely parse with type safety
      const data = safeJsonParse<ToolCallArguments>(validJson, defaultArgs);
      processData(data);
      
      // Reset buffer after successful processing
      buffer = JsonBufferHelpers.resetBuffer();
    }
  }
}

// For delta-based JSON processing (Anthropic-style)
function processDeltaJsonFragment(currentJson: string, deltaJson: string) {
  // Process JSON using delta-based approach
  const result = processJsonDelta(currentJson, deltaJson);
  
  // Check if we now have a complete JSON object
  if (result.complete) {
    const data = safeJsonParse<ToolCallArguments>(result.combined, defaultArgs);
    processData(data);
    return "";  // Reset after processing
  } else {
    // Continue accumulating fragments
    return result.combined;
  }
}
```

### Robust Error Handling with Retry Logic

```typescript
import { getErrorMessage, isConnectionError } from "./errors";
import { safeJsonParse } from "./json";

async function callApiWithRetry<T>(
  apiCall: () => Promise<Response>,
  maxRetries: number = 3
): Promise<T> {
  let retryCount = 0;
  
  while (retryCount <= maxRetries) {
    try {
      const response = await apiCall();
      
      if (!response.ok) {
        const errorText = await response.text();
        const errorJson = safeJsonParse<ErrorResponse>(errorText, { error: { message: errorText } });
        const errorMessage = errorJson.error?.message || errorText;
        throw new Error(`API error ${response.status}: ${errorMessage}`);
      }
      
      const data = await response.json();
      return data as T;
    } catch (error: unknown) {
      retryCount++;
      const errorMessage = getErrorMessage(error);
      
      if (retryCount <= maxRetries && isConnectionError(error)) {
        // Exponential backoff
        const backoffTime = Math.min(1000 * Math.pow(2, retryCount - 1), 30000);
        console.log(`Retry ${retryCount}/${maxRetries} after ${backoffTime}ms: ${errorMessage}`);
        await new Promise(resolve => setTimeout(resolve, backoffTime));
      } else {
        throw error;
      }
    }
  }
  
  throw new Error(`Maximum retries (${maxRetries}) exceeded`);
}
```

### Type-Safe Message Processing

```typescript
import { extractContentAsString, extractQueryContext } from "./messageUtils";
import { ensureValidIndex } from "./typeUtils";

function processMessages(messages: ChatMessage[]): { 
  lastUserMessage: string;
  lastAssistantMessage: string | null;
  queryContext: string;
} {
  // Find indices of last user and assistant messages
  let lastUserIndex: number | null = null;
  let lastAssistantIndex: number | null = null;
  
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user" && lastUserIndex === null) {
      lastUserIndex = i;
    } else if (messages[i].role === "assistant" && lastAssistantIndex === null) {
      lastAssistantIndex = i;
    }
    
    if (lastUserIndex !== null && lastAssistantIndex !== null) {
      break;
    }
  }
  
  // Extract query context from all messages
  const queryContext = extractQueryContext(messages);
  
  // Safely access last user message
  const lastUserMessage = lastUserIndex !== null 
    ? extractContentAsString(messages[lastUserIndex].content)
    : "";
  
  // Safely access last assistant message if it exists
  const lastAssistantMessage = lastAssistantIndex !== null
    ? extractContentAsString(messages[lastAssistantIndex].content)
    : null;
  
  return { lastUserMessage, lastAssistantMessage, queryContext };
}
```

### Tool Call Processing and Repair

```typescript
import { safeJsonParse, extractValidJson, repairDuplicatedJsonPattern } from "./json";
import { isSearchTool, processSearchToolArguments, formatToolResultsContent } from "./toolUtils";

// Process and repair tool arguments
function processToolArguments(args: string, toolName: string, messages: ChatMessage[]): string {
  // Try to repair broken JSON arguments
  let repairedArgs = args;
  
  // Check for nested or broken JSON structures
  if (typeof args === 'string') {
    // First, check for duplicated JSON patterns and repair them
    repairedArgs = repairDuplicatedJsonPattern(args);
    
    // Extract valid JSON from potentially broken structure
    const validJson = extractValidJson(repairedArgs);
    if (validJson) {
      repairedArgs = validJson;
    } else {
      // Try other repair approaches
      const doublePropertyPattern = /\{\s*"(\w+)"\s*:\s*"(.*?)"\s*\{\s*"\1"\s*:/;
      const match = args.match(doublePropertyPattern);
      if (match && match[1] && match[2]) {
        repairedArgs = `{"${match[1]}": "${match[2]}"}`;
      }
    }
  }
  
  // If it's a search tool, use specialized processing
  if (isSearchTool(toolName)) {
    return processSearchToolArguments(toolName, "", repairedArgs, messages);
  }
  
  // For other tools, ensure valid JSON
  try {
    const parsedArgs = safeJsonParse(repairedArgs, {});
    return JSON.stringify(parsedArgs);
  } catch {
    // Return the repaired args if parsing fails
    return repairedArgs;
  }
}

// Create proper tool result blocks
function createToolResults(toolCalls: ToolCall[]): string {
  // Format tool results in a standardized format
  const toolResults = toolCalls.map(tool => ({
    role: "tool",
    tool_call_id: tool.id,
    content: `Tool execution result for ${tool.function.name}`
  }));
  
  return formatToolResultsContent(toolResults);
}
```

## Best Practices for Utility Usage

### Type Safety

When working with null and undefined values that might be used as array indices:

```typescript
import { asNumber, ensureValidIndex } from "./typeUtils";

// Best practice for null-safe array access
if (maybeIndex !== null) {
  const safeIndex = ensureValidIndex(maybeIndex, array.length);
  if (safeIndex !== null) {
    // Now safe to use as array index
    const item = array[safeIndex];
  }
}
```

### Error Handling

Consistent error handling across the codebase:

```typescript
import { getErrorMessage, isConnectionError } from "./errors";

try {
  // API call or other operation
} catch (error: unknown) {
  // Get a consistent error message regardless of error type
  const errorMessage = getErrorMessage(error);
  
  // Decide if retry is appropriate
  if (isConnectionError(error)) {
    // Handle connection error - perhaps retry
  } else {
    // Handle other errors
  }
}
```

#### State-Aware Error Handling

When working with streaming or stateful operations, include state information in error results:

```typescript
import { getErrorMessage, isConnectionError } from "./errors";

interface ErrorResult<T> {
  success: boolean;
  error: Error;
  state: T;  // Always include state property for all error patterns
}

function handleProcessingError<T>(error: unknown, currentState: T): ErrorResult<T> {
  const errorMessage = getErrorMessage(error);
  
  if (isConnectionError(error) || 
      (error instanceof DOMException && error.name === 'AbortError')) {
    // For connection errors, preserve current state
    return {
      success: false,
      error: error instanceof Error ? error : new Error(errorMessage),
      state: { ...currentState }  // Copy current state
    };
  } else {
    // For other errors, also include state property but use initial values
    return {
      success: false,
      error: error instanceof Error ? error : new Error(errorMessage),
      state: createInitialState<T>()  // Function to create initial state
    };
  }
}

// Usage example
try {
  // Processing operation
} catch (error: unknown) {
  const result = handleProcessingError(error, currentState);
  
  if (result.success === false) {
    // Display error message
    console.error(`Error occurred: ${result.error.message}`);
    
    // Use error state for recovery
    const recoveryState = result.state;
    // Recovery process...
  }
}
```

### JSON Processing

For handling JSON in streaming contexts or when parsing potentially malformed JSON:

```typescript
import { safeJsonParse, isValidJson, extractValidJson, processJsonDelta } from "./json";
import { JsonBufferHelpers } from "./streamProcessing";

// For complete JSON:
const config = safeJsonParse(jsonText, defaultConfig);

// For streaming JSON fragments:
let buffer = JsonBufferHelpers.resetBuffer();

// When receiving a fragment:
buffer = JsonBufferHelpers.addToBuffer(fragment, buffer, maxBufferSize);

// Check if buffer is complete JSON:
if (JsonBufferHelpers.isBufferComplete(buffer)) {
  const data = safeJsonParse(buffer, defaultValue);
  // Process data
}

// Extract valid JSON from text with extra content:
const validJson = extractValidJson(mixedContent);
if (validJson) {
  const data = safeJsonParse(validJson, defaultValue);
  // Process valid JSON portion
}

// Extract JSON and remainder text:
const result = JsonBufferHelpers.extractJsonAndRemainder(text);
if (result) {
  const [jsonObj, remainder] = result;
  // Process jsonObj
  // Handle remainder separately
}

// Delta-based JSON processing:
let currentJson = "";

// When receiving a delta:
const result = processJsonDelta(currentJson, deltaJson);
currentJson = result.combined;

// Check if we now have complete JSON:
if (result.complete && result.valid) {
  const data = safeJsonParse(currentJson, defaultValue);
  // Process complete JSON
  currentJson = ""; // Reset buffer
}
```

## Module Integration Guidelines

To maximize code reuse and maintain clear responsibility boundaries:

1. **Use Utility Functions First**: Before implementing custom logic, check if a utility function already exists.

2. **Keep Provider-Specific Logic Separate**: General utilities should be provider-agnostic. Move provider-specific logic to the provider's module.

3. **Extend Common Utilities**: If you need specialized behavior, extend the common utility rather than duplicating it.

4. **Error Handling Consistency**: Always use error utilities to maintain consistent error handling patterns.

5. **Type Safety**: Leverage type utilities for complex type scenarios, especially with null handling and array indices.

6. **JSON Processing Best Practices**: 
   - Always use `safeJsonParse` instead of direct `JSON.parse`
   - Extract valid JSON with `extractValidJson` when dealing with mixed content
   - Process streaming JSON fragments with `JsonBufferHelpers`
   - Use delta-based processing with `processJsonDelta` for Anthropic-style incremental JSON
   - Repair duplicated JSON patterns with `repairDuplicatedJsonPattern`
   - Use proper type annotations with generic parameters

7. **Immutable Data Patterns**:
   - Avoid reassigning `const` variables; use property updates instead
   - Create new objects instead of mutating existing ones
   - Use spread operators and object destructuring for updates

8. **Modular Responsibility**:
   - Respect the separation of concerns between utility modules
   - Combine utilities to create higher-level functionality
   - Keep utility functions focused on a single responsibility

By following these guidelines, we can maintain high code quality with clear module boundaries while minimizing code duplication across the codebase.
