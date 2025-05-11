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
- Support transient error detection for intelligent retry decisions

**Key functions:**
- `getErrorMessage(error: unknown): string` - Safely extracts error messages from various error types
- `isConnectionError(error: unknown): boolean` - Identifies network-related errors for retry decisions
- `isTransientError(error: unknown): boolean` - Identifies temporary errors that are suitable for retry attempts
- `BaseStreamingError` - Interface for common error structure
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
- `processJsonDelta(currentJson: string, deltaJson: string): {combined: string; complete: boolean; valid: boolean}` - Processes JSON fragments using delta-based approach for incremental JSON accumulation - CRITICAL for handling streaming tool calls
- `repairDuplicatedJsonPattern(jsonStr: string): string` - Detects and repairs duplicated JSON patterns
- `processToolArgumentsDelta(currentArgs: string, deltaArgs: string): {processedArgs: string; isComplete: boolean}` - Processes tool arguments using delta-based approach for streaming contexts
- `tryFixBrokenBooleanJson(text: string): string` - Repairs broken boolean values in JSON (e.g., "rue" -> "true")

### `messageUtils.ts`
Message processing utilities that:
- Convert between different message formats required by various LLM providers
- Extract and transform content from complex message structures
- Provide helpers for working with chat message histories
- Extract query contexts and relevant information from conversation history
- Validate tool result blocks in messages

**Key functions:**
- `extractContentAsString(content: any): string` - Safely extracts content as string from various formats (MessageContent type)
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
- `processContentDelta(content: string | unknown, currentMessage: ChatMessage): { updatedMessage: ChatMessage, shouldYield: boolean }` - Handles incremental content updates and produces updated messages
- `JsonBufferHelpers` - Utilities for buffering and processing partial JSON fragments in streams:
  - `addToBuffer(newData, currentBuffer, maxBufferSize)` - Adds data to buffer with size limiting
  - `resetBuffer()` - Resets the JSON buffer
  - `isBufferComplete(buffer)` - Checks if buffer contains complete valid JSON
  - `extractValidJsonFromBuffer(buffer)` - Extracts valid JSON from buffer
  - `extractJsonAndRemainder(buffer)` - Extracts JSON and returns remaining content
  - `safelyMergeJsonStrings(firstJson, secondJson)` - Safely merges two JSON strings
- `BaseStreamProcessor` - Base class for provider-specific stream processors with shared functionality:
  - `processThinking(thinkingData: unknown): ChatMessage` - Processes thinking data into message format
  - `processContent(contentDelta: string | unknown, currentMessage: ChatMessage): { updatedMessage: ChatMessage, shouldYield: boolean }` - Processes content deltas with standardized approach
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
- Repair malformed JSON in tool arguments

**Key functions:**
- `isSearchTool(name: string): boolean` - Identifies if a tool is a search tool
- `processSearchToolArguments(name: string, args: string, context: string): string` - Processes search tool arguments
- `formatToolResultsContent(results: any): string` - Formats tool results in standardized format
- `doesModelSupportTools(provider: string, model: string): boolean` - Checks if a model supports tool functionality
- `isToolOfType(toolName: string, typePatterns: string[]): boolean` - Checks if a tool belongs to a specific category
- `repairToolArguments(args: string): string` - Repairs malformed JSON in tool arguments through multiple strategies
  - Checks if the JSON is already valid
  - Attempts to extract valid JSON from mixed content
  - Repairs duplicated JSON patterns
  - Fixes mismatched braces
  - Handles other common error patterns
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

### Handling Complex Message Content Types

```typescript
import { extractContentAsString } from "./messageUtils";

// When you need to ensure content is a string, regardless of its original type
function processMessageContent(message: ChatMessage): string {
  // Safely extract the content as a string, even if it's an array of MessagePart objects
  const contentAsString = extractContentAsString(message.content);
  
  // Now contentAsString is guaranteed to be a string you can work with
  return contentAsString;
}

// When comparing content from different message objects
function hasContentChanged(oldMessage: ChatMessage, newMessage: ChatMessage): boolean {
  const oldContent = extractContentAsString(oldMessage.content);
  const newContent = extractContentAsString(newMessage.content);
  
  return oldContent !== newContent;
}
```

### Delta-based JSON Processing for Tool Calls 

```typescript
// IMPORTANT: Always remember to import processJsonDelta for JSON delta processing
import { processJsonDelta } from "../../utils/json.js";

// Process tool arguments in a streaming context
function processToolArguments(jsonBuffer: string, newFragment: string): { 
  processed: string, 
  complete: boolean 
} {
  try {
    // Use processJsonDelta to incrementally build JSON
    const result = processJsonDelta(jsonBuffer, newFragment);
    
    if (result.complete && result.valid) {
      // We have a complete valid JSON
      return {
        processed: result.combined,
        complete: true
      };
    } else {
      // Continue accumulating
      return {
        processed: result.combined,
        complete: false
      };
    }
  } catch (error) {
    console.error(`Error processing JSON delta: ${error}`);
    return {
      processed: jsonBuffer,
      complete: false
    };
  }
}
```

### Tool Argument Repair

```typescript
// IMPORTANT: Always use repairToolArguments from toolUtils.js, not json.js
import { repairToolArguments } from "../../utils/toolUtils.js";

// Process and repair tool arguments
function processToolArguments(args: string): string {
  // Handle empty arguments
  if (!args || args.trim() === '') {
    return '{}';
  }
  
  // Use repairToolArguments utility to fix malformed JSON
  const repairedArgs = repairToolArguments(args);
  
  return repairedArgs;
}
```

### Using Stream Processing Utilities for Content Updates

```typescript
import { processContentDelta } from "./streamProcessing";

function handleContentUpdate(
  newContent: string,
  currentMessage: ChatMessage
): { updatedMessage: ChatMessage, shouldSendToUser: boolean } {
  // Use common utility to process the content delta
  const processResult = processContentDelta(newContent, currentMessage);
  
  // The utility handles merging content with the existing message
  const updatedMessage = processResult.updatedMessage;
  
  // It also indicates if the message should be yielded to the user
  const shouldSendToUser = processResult.shouldYield;
  
  // Additional provider-specific logic can be added here
  
  return { updatedMessage, shouldSendToUser };
}
```

### Robust Error Handling with Retry Logic

```typescript
import { getErrorMessage, isConnectionError, isTransientError } from "./errors";
import { safeJsonParse } from "./json";

async function callApiWithRetry<T>(
  apiCall: () => Promise<Response>,
  maxRetries: number = 3,
  state?: any
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
      
      // Only retry if it's a transient error and we haven't exceeded max retries
      if (retryCount <= maxRetries && isTransientError(error)) {
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

// Generic retry wrapper for any async operation
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  state?: any
): Promise<T> {
  let retryCount = 0;
  
  while (true) {
    try {
      return await operation();
    } catch (error: unknown) {
      retryCount++;
      
      if (retryCount > maxRetries || !isTransientError(error)) {
        throw error;
      }
      
      // Log retry information
      console.log(`Retry ${retryCount}/${maxRetries}: ${getErrorMessage(error)}`);
      
      // Exponential backoff with jitter
      const jitter = Math.random() * 0.3 + 0.85; // Random factor between 0.85 and 1.15
      const backoffTime = Math.min(1000 * Math.pow(2, retryCount - 1) * jitter, 30000);
      await new Promise(resolve => setTimeout(resolve, backoffTime));
    }
  }
}
```

### Tool Call Processing and Repair

```typescript
import { safeJsonParse, extractValidJson } from "./json";
import { isSearchTool, processSearchToolArguments, formatToolResultsContent, repairToolArguments } from "./toolUtils";

// Process and repair tool arguments
function processToolArguments(args: string, toolName: string, messages: ChatMessage[]): string {
  // Handle empty arguments
  if (!args || args.trim() === '') {
    return '{}';
  }
  
  // Try to repair broken JSON arguments using the common utility
  const repairedArgs = repairToolArguments(args);
  
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

// Process streaming tool arguments
function processStreamingToolArgs(
  currentArgs: string,
  deltaArgs: string,
  toolName: string
): { processedArgs: string; isComplete: boolean } {
  return processToolArgumentsDelta(currentArgs, deltaArgs);
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

## Utilizing Modular Design in Streaming Processors

When implementing streaming processors for different LLM providers, the recommended approach is to use a modular design with small, focused methods:

```typescript
// Modular approach with focused methods
class StreamProcessor {
  // Process a streaming chunk with clear responsibility separation
  processChunk(chunk: StreamingChunk, currentState: StreamState): ProcessingResult {
    // First, check for thinking mode (handled by a dedicated method)
    if (chunk.thinking) {
      return this.processThinkingChunk(chunk.thinking, currentState);
    }
    
    // Then, handle content delta (handled by a dedicated method)
    if (chunk.choices?.[0]?.delta?.content) {
      return this.processContentDelta(
        chunk.choices[0].delta.content,
        currentState
      );
    }
    
    // Finally, handle tool calls (handled by a dedicated method)
    if (chunk.choices?.[0]?.delta?.tool_calls) {
      return this.processToolCallDelta(
        chunk.choices[0].delta.tool_calls,
        currentState
      );
    }
    
    // Default return if no processing occurred
    return { ...currentState, shouldYield: false };
  }
  
  // Dedicated method for processing thinking chunks
  private processThinkingChunk(
    thinkingData: ThinkingData,
    currentState: StreamState
  ): ProcessingResult {
    // Implementation focused solely on thinking chunks
  }
  
  // Dedicated method for processing content deltas
  private processContentDelta(
    contentDelta: string,
    currentState: StreamState
  ): ProcessingResult {
    // Implementation focused solely on content deltas
    // Use common utility for standardized processing
    const result = processContentDelta(contentDelta, currentState.message);
    return {
      ...currentState,
      message: result.updatedMessage,
      shouldYield: result.shouldYield
    };
  }
  
  // Dedicated method for processing tool call deltas
  private processToolCallDelta(
    toolCallDelta: ToolCallDelta[],
    currentState: StreamState
  ): ProcessingResult {
    // Implementation focused solely on tool call deltas
  }
}
```

## Supporting the Orchestrator Pattern

The utility modules are designed to work well with the orchestrator pattern used in complex LLM providers:

1. **Providing standardized utilities for specialized modules**:
   - Each utility module offers standardized functions that can be used by specialized provider modules
   - Error handling utilities for error processing modules
   - JSON utilities for streaming and tool call modules
   - Message utilities for message formatting modules

2. **Supporting clear responsibility boundaries**:
   - Utilities maintain focused responsibilities
   - Each utility addresses a specific aspect of LLM integration
   - Provider modules can compose these utilities to create higher-level functionality

3. **Enabling state management across modules**:
   - Utilities follow immutable patterns for state updates
   - They provide standardized interfaces for state transitions
   - Error handling utilities preserve state during recovery

4. **Standardizing common patterns**:
   - JSON fragment handling follows consistent patterns across providers
   - Error handling and retry logic is standardized
   - Stream processing follows established conventions

This approach allows provider implementations to focus on their unique requirements while leveraging shared functionality for common tasks.

## Recent Improvements

### Utility Function Relocations (May 2025)

Key function relocations to better organize utilities by responsibility:

- `repairToolArguments` function has been moved from `json.js` to `toolUtils.js` to better align with its purpose
  - All provider modules should import this function from `toolUtils.js` not `json.js`
  - This improves code organization and ensures tool-related utilities are in the appropriate module

```typescript
// CORRECT import path for repairToolArguments
import { repairToolArguments } from "../../utils/toolUtils.js";

// INCORRECT import path (no longer valid)
// import { repairToolArguments } from "../../utils/json.js"; 
```

### Streaming Response Handling (May 2025)

Added improved support for response body streaming across different platforms:

- Enhanced compatibility with different response body formats
- Used `streamSse` from core module to handle streaming responses consistently
- Addressed issues with `response.body?.getReader` for platforms that don't support it
- Fixed streaming issues with Databricks Claude 3.7 Sonnet integration

```typescript
// IMPORTANT: Use standardized streaming utilities for compatibility
import { streamSse } from "../../stream.js";

// Process streaming response
async function processStreamingResponse(response: Response) {
  try {
    // Use standardized utility function for all streaming responses
    for await (const data of streamSse(response)) {
      // Process each chunk
      processChunk(data);
    }
  } catch (error) {
    console.error(`Streaming error: ${getErrorMessage(error)}`);
    // Handle error appropriately
  }
}
```

### Message Content Type Handling (May 2025)

Added better support for handling complex message content types:

- Enhanced `extractContentAsString` to properly handle both `string` and `MessagePart[]` content types
- Improved type safety by ensuring proper conversion between message content types
- Added examples and documentation for correctly handling MessageContent type variations
- Resolved common type compatibility issues when comparing or manipulating message content

```typescript
// Before - causes TypeScript error
lastYieldedMessageContent = currentMessage.content; // Error: Type 'MessageContent' is not assignable to type 'string'

// After - safely extracts content as string
import { extractContentAsString } from "../../utils/messageUtils.js";
lastYieldedMessageContent = extractContentAsString(currentMessage.content);

// When comparing message content:
const currentContentAsString = extractContentAsString(currentMessage.content);
if (currentContentAsString !== lastYieldedMessageContent) {
  // Now type-safe comparison
}
```

### Centralized Tool Arguments Repair (May 2025)

The `repairToolArguments` function has been added to the common utilities in `toolUtils.ts` to provide a centralized, robust solution for repairing malformed JSON in tool arguments. This function:

- Checks if the JSON is already valid
- Attempts to extract valid JSON from mixed content
- Repairs duplicated JSON patterns
- Fixes mismatched braces (opening and closing brackets)
- Handles other common error patterns

This enables provider modules to leverage a standardized approach for JSON repair, reducing code duplication and improving maintainability.

```typescript
// Example usage in provider modules
import { repairToolArguments } from "../../utils/toolUtils.js";

function processToolArguments(args: string): string {
  // Use the common utility for repairing tool arguments
  return repairToolArguments(args);
}
```

### JSON Delta Processing Centralization (May 2025)

The `processJsonDelta` function has been moved to the common utilities in `json.ts` to provide a standardized approach for handling incremental JSON updates in streaming contexts. This function is especially critical for handling streaming tool calls from providers like Databricks Claude 3.7 Sonnet. Always make sure to import this function when working with JSON in streaming contexts:

```typescript
// IMPORTANT: Always import processJsonDelta when working with streaming JSON
import { processJsonDelta } from "../../utils/json.js";

// Example usage in a streaming context
function handleStreamingJson(currentJson: string, deltaJson: string) {
  const result = processJsonDelta(currentJson, deltaJson);
  if (result.complete && result.valid) {
    // Process complete JSON
    return {
      jsonBuffer: "",
      isComplete: true,
      parsedJson: JSON.parse(result.combined)
    };
  } else {
    // Continue accumulating
    return {
      jsonBuffer: result.combined,
      isComplete: false,
      parsedJson: null
    };
  }
}
```

### Boolean Value Repair in JSON (May 2025)

Added a specialized function `tryFixBrokenBooleanJson` to repair common JSON boolean value corruption issues:

```typescript
// New function to fix broken boolean values in JSON
function tryFixBrokenBooleanJson(text: string): string {
  if (!text || typeof text !== 'string') {
    return text;
  }
  
  let result = text;

  // "rue" -> "true" repair (when true is truncated)
  result = result.replace(/([{,]\s*"\w+"\s*:)\s*rue([,}])/g, '$1 true$2');
  
  // "als" or "alse" -> "false" repair (when false is truncated)
  result = result.replace(/([{,]\s*"\w+"\s*:)\s*als([,}])/g, '$1 false$2');
  result = result.replace(/([{,]\s*"\w+"\s*:)\s*alse([,}])/g, '$1 false$2');
  
  // Specific case fixes
  if (result.includes('rue}')) {
    result = result.replace(/rue}/g, 'true}');
  }
  
  if (result.includes('als}')) {
    result = result.replace(/als}/g, 'false}');
  }
  
  if (result.includes('alse}')) {
    result = result.replace(/alse}/g, 'false}');
  }
  
  return result;
}
```

This function is particularly useful for fixing JSON errors in streaming contexts where boolean values may be truncated.

### String Literal Escaping Fix (May 2025)

A major issue related to string literal escaping in JSON handling functions has been resolved. The problem occurred due to improperly escaped double quotes (`\"`) in TypeScript files, which caused compilation errors. The fix:

- Replaced improper `\"` escapes with proper unescaped quotes in single quote literals
- Used a consistent string delimiter approach (single quotes for strings containing double quotes)
- Fixed backslash escaping in regular expressions
- Improved handling of JSON strings containing special characters

This fix ensures that the utilities work correctly across different build environments and prevents TypeScript compilation errors. This is particularly important for the `json.ts` utility file, which is used across all LLM integrations.

```typescript
// BEFORE: Problematic escaped quotes (causes TypeScript errors)
if (!text || typeof text !== 'string' || text.trim() === \"\") {
  return null;
}

// AFTER: Proper string literal syntax
if (!text || typeof text !== 'string' || text.trim() === "") {
  return null;
}
```

### Type-Safe Error Handling for Unknown Types (May 2025)

Improved the error handling pattern to ensure type safety when dealing with unknown error types:

- Enhanced `getErrorMessage` utility to safely handle various error formats
- Updated error handling in all modules to leverage this common utility
- Improved error messages to include more diagnostic information
- Added explicit type annotations to catch blocks to ensure type safety

This improvement helps resolve common TypeScript errors like "streamError is of type 'unknown'" that occur when trying to access properties on unknown error types.

```typescript
// BEFORE: Unsafe error property access (causes TypeScript errors)
try {
  // Operation
} catch (streamError) {
  console.error(`Error details: ${streamError.name}, ${streamError.message}`);
}

// AFTER: Type-safe error handling
import { getErrorMessage, isConnectionError } from "../../utils/errors.js";

try {
  // Operation
} catch (streamError: unknown) {
  // Safely extract error message regardless of error type
  const errorMessage = getErrorMessage(streamError);
  console.error(`Error details: ${errorMessage}`);
  
  // Type-safe error classification
  if (isConnectionError(streamError)) {
    // Handle connection errors
  }
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
import { getErrorMessage, isConnectionError, isTransientError } from "./errors";

try {
  // API call or other operation
} catch (error: unknown) {
  // Get a consistent error message regardless of error type
  const errorMessage = getErrorMessage(error);
  
  // Decide if retry is appropriate
  if (isTransientError(error)) {
    // Handle transient error - perhaps retry
  } else {
    // Handle permanent errors
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
  
  if (isTransientError(error)) {
    // For transient errors, preserve current state
    return {
      success: false,
      error: error instanceof Error ? error : new Error(errorMessage),
      state: { ...currentState }  // Copy current state
    };
  } else {
    // For permanent errors, also include state property but use initial values
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

7. **Message Content Type Handling**:
   - Always use `extractContentAsString` when comparing or manipulating message content
   - Be mindful of the `MessageContent` type which can be either string or array
   - When setting content that must be string, always convert with proper utility

8. **Immutable Data Patterns**:
   - Avoid reassigning `const` variables; use property updates instead
   - Create new objects instead of mutating existing ones
   - Use spread operators and object destructuring for updates

9. **Modular Responsibility**:
   - Respect the separation of concerns between utility modules
   - Combine utilities to create higher-level functionality
   - Keep utility functions focused on a single responsibility
   - Break down large methods into smaller ones with clear purposes
   - Use descriptive names that indicate a method's responsibility

10. **Method Abstraction Levels**:
    - Maintain consistent abstraction levels within classes and modules
    - Public methods should operate at a higher abstraction level
    - Helper methods should handle specific implementation details
    - Keep methods short and focused on one task

11. **Imports Checklist - Critical Functions**: 
    - Always check that you've imported all necessary functions, especially:
    - `processJsonDelta` for handling streaming JSON
    - `repairToolArguments` for fixing tool call JSON (from toolUtils.js, not json.js)
    - `processToolArgumentsDelta` for streaming tool call processing
    - `getErrorMessage` for error handling
    - `extractContentAsString` for handling message content properly
    - `streamSse` for streaming response handling

12. **String Literal Best Practices**:
    - Use single quotes for strings containing double quotes and vice versa
    - Only escape quotes when they would otherwise terminate the string
    - Use template literals for complex strings with interpolation
    - Be careful with backslashes in string literals - double them in regular expressions

13. **Type-Safe Error Handling**:
    - Add explicit `unknown` type annotations in catch blocks
    - Use `getErrorMessage` to safely extract error information
    - Never directly access properties on unknown error types
    - Use type guards to narrow error types when needed
    - Leverage `isConnectionError` and similar utilities for error classification

By following these guidelines, we can maintain high code quality with clear module boundaries while minimizing code duplication across the codebase.
