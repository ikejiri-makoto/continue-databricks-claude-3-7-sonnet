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

**Key functions:**
- `safeStringify(obj: unknown, defaultValue?: string): string` - Converts objects to strings with error handling
- `isValidJson(text: string): boolean` - Validates if a string is valid JSON
- `safeJsonParse<T>(text: string, fallback?: T): T` - Safely parses JSON with type information

### `messageUtils.ts`
Message processing utilities that:
- Convert between different message formats required by various LLM providers
- Extract and transform content from complex message structures
- Provide helpers for working with chat message histories
- Extract query contexts and relevant information from conversation history

**Key functions:**
- `extractContentAsString(content: any): string` - Safely extracts content as string from various formats
- `extractQueryContext(messages: any[]): string` - Extracts the main query context from a conversation
- `sanitizeMessages(messages: any[]): any[]` - Cleans messages for API consumption

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

**Key functions:**
- `processContentDelta(currentContent: string, delta: string): string` - Handles incremental content updates
- `JsonBufferHelpers` - Utilities for buffering partial JSON fragments in streams
- `StreamProcessor` - Base class for provider-specific stream processors

### `typeUtils.ts`
Type safety utilities that:
- Provide helper functions for TypeScript type narrowing and validation
- Ensure null safety in complex code flows
- Offer reusable patterns for type-safe operations

**Key functions:**
- `asNumber(value: unknown): number` - Safely converts values to numbers with validation
- `isNonNullIndex(index: number | null): index is number` - Type guard for non-null indices
- `ensureValidIndex(index: unknown, arrayLength: number): number | null` - Validates array indices

## Best Practices for Utility Usage

### Type Safety

When working with null and undefined values that might be used as array indices:

```typescript
import { asNumber, ensureValidIndex } from "../utils/typeUtils";

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
import { getErrorMessage, isConnectionError } from "../utils/errors";

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

### JSON Processing

For handling JSON in streaming contexts or when parsing potentially malformed JSON:

```typescript
import { safeJsonParse, isValidJson } from "../utils/json";
import { JsonBufferHelpers } from "../utils/streamProcessing";

// For complete JSON:
const config = safeJsonParse(jsonText, defaultConfig);

// For streaming JSON fragments:
let buffer = JsonBufferHelpers.resetBuffer();

// When receiving a fragment:
buffer = JsonBufferHelpers.addToBuffer(fragment, buffer);

// Check if buffer is complete JSON:
if (isValidJson(buffer)) {
  const data = JSON.parse(buffer);
  // Process data
}
```

## Module Integration Guidelines

To maximize code reuse and maintain clear responsibility boundaries:

1. **Use Utility Functions First**: Before implementing custom logic, check if a utility function already exists.

2. **Keep Provider-Specific Logic Separate**: General utilities should be provider-agnostic. Move provider-specific logic to the provider's module.

3. **Extend Common Utilities**: If you need specialized behavior, extend the common utility rather than duplicating it.

4. **Error Handling Consistency**: Always use error utilities to maintain consistent error handling patterns.

5. **Type Safety**: Leverage type utilities for complex type scenarios, especially with null handling and array indices.

By following these guidelines, we can maintain high code quality with clear module boundaries while minimizing code duplication across the codebase.
