# Continue VS Code Extension - LLM Core Framework

This directory contains the core framework for integrating Large Language Models (LLMs) into the Continue VS Code extension. It provides the foundation for all LLM interactions, handling everything from model communication to token counting, message formatting, and capability detection.

## Directory Structure

```
core/llm/
├── llms/                  # Provider-specific LLM implementations
│   ├── provider.ts        # Single-file provider implementations
│   └── Provider/          # Modular provider implementations
├── rules/                 # Rules for validating and transforming LLM interactions
├── templates/             # Prompt templates for different model types
├── utils/                 # Utility functions for LLM operations
├── types/                 # Type definitions and extensions
├── autodetect.ts          # Capability and template detection for models
├── constants.ts           # Constant values used throughout the LLM system
├── countTokens.ts         # Functions for token counting across models
├── index.ts               # Main entry point and BaseLLM implementation
├── stream.ts              # Streaming utilities for LLM responses
├── toolSupport.ts         # Definitions for agent/tool support by provider
└── other supporting files
```

## Core Components

### `index.ts`
The heart of the LLM integration system, containing:
- `BaseLLM` abstract class that all LLM providers extend
- Core methods for chat, completion, and embedding operations
- Stream handling and error management
- Logging and telemetry integration

### `autodetect.ts`
Responsible for auto-detecting model capabilities:
- Determines which models support images, tools, and other features
- Maps models to appropriate prompt templates
- Identifies which providers can handle custom formatting

### `toolSupport.ts`
Defines which providers and models support agent functionality:
- `PROVIDER_TOOL_SUPPORT` mapping indicating which models can use tools
- Provider-specific detection functions for tool capabilities

### `stream.ts`
Utilities for handling streaming responses from LLMs:
- Implements Server-Sent Events (SSE) parsing
- Manages chunked responses from different API formats
- Ensures proper handling of tool calls in streaming mode

### `countTokens.ts`
Functions for token counting and context management:
- Implements token counting for different model families
- Handles message pruning to fit context windows
- Optimizes prompt construction to maximize token efficiency

## Key Features

### Agent and Tool Support
The framework includes robust support for agent functionality:
- Tool definition and execution through LLM APIs
- Streaming tool calls and responses
- Provider-specific adaptations for tool handling
- Tool argument validation and repair mechanisms
- Standardized tool result formatting across providers
- Anthropic-style JSON delta processing for more robust tool calls
- Control for parallel tool calls to prevent duplicated JSON issues

### Multi-Provider Architecture
Designed to work with a wide variety of LLM providers:
- Common interface across all providers
- Automatic capability detection
- Provider-specific optimizations

### Streaming Support
Comprehensive streaming implementation:
- Real-time token delivery for responsive UI
- Proper handling of structured data in streams
- Support for advanced features like "thinking" blocks
- Robust JSON fragment handling in streaming contexts
- Delta-based JSON processing for improved stability with partial JSON

### Template System
Flexible prompt template system:
- Model-specific message formatting
- Handlebars-based template rendering
- Support for various prompt engineering techniques

### Enhanced JSON Processing
Robust JSON processing utilities for handling streaming and partial content:
- Extraction of valid JSON from mixed content or fragments
- Safe parsing with type information and error handling
- Deep merging of JSON objects with proper structure preservation
- Buffer management for accumulating JSON fragments in streams
- Automatic repair of malformed JSON in tool arguments
- Delta-based JSON processing for Anthropic-style incremental JSON updates
- Pattern detection and repair for duplicated JSON structures

### Robust Error Handling
Comprehensive error handling system:
- Standardized error processing across the framework
- Common utilities for error detection and classification
- Retry mechanisms with exponential backoff
- State preservation during retries for streaming operations
- Connection error recovery with session resumption
- Type-safe error handling with dedicated interfaces
- Transient error detection and automatic recovery
- Generic retry mechanisms with customizable strategies

### Claude 3.7 Sonnet Thinking Mode Support
Support for the advanced thinking mode capability in Claude 3.7 Sonnet:
- Structured thinking process with detailed step-by-step reasoning
- Configurable thinking budget for controlling token allocation
- Integration with streaming to show real-time thinking process
- Type-safe handling of thinking-specific parameters and responses
- Automatic detection and configuration for Claude 3.7 models

## Provider Implementation Patterns

The framework supports two main patterns for implementing LLM providers:

### 1. Single-File Implementation
For simpler providers, a single file approach works well:
```
llms/
└── SimpleProvider.ts
```

This approach is suitable when:
- The provider has straightforward API requirements
- There's minimal need for specialized processing
- The implementation is relatively compact

### 2. Modular Implementation
For complex providers, a modular approach with clear separation of concerns:
```
llms/
├── ComplexProvider.ts     # Main orchestrator class
└── ComplexProvider/       # Supporting modules
    ├── config.ts          # Configuration management
    ├── errors.ts          # Error handling
    ├── helpers.ts         # Helper functions
    ├── messages.ts        # Message formatting
    ├── streaming.ts       # Stream processing
    ├── toolcalls.ts       # Tool call handling
    └── types/             # Provider-specific types
```

This approach is preferred when:
- The provider requires complex processing logic
- Different aspects of the provider have distinct responsibilities
- The implementation benefits from code organization and reuse
- Type safety and maintainability are high priorities

## Usage Example

The typical flow for using the LLM framework:

```typescript
// Create an LLM instance based on configuration
const llm = await llmFromDescription({
  provider: "databricks",
  model: "databricks-claude-3-7-sonnet",
  // other options...
});

// Stream a chat completion
for await (const message of llm.streamChat(
  [{ role: "user", content: "Tell me about Continue" }],
  new AbortController().signal,
  { 
    // Enable agent functionality with tools
    tools: [
      {
        type: "function",
        function: {
          name: "search_docs",
          description: "Search the documentation",
          parameters: { /* OpenAPI schema */ }
        }
      }
    ]
  }
)) {
  // Process each message chunk
  console.log(message);
}
```

## Adding Custom Provider Support

To add a new LLM provider:
1. Create a new file in the `llms/` directory
2. Extend the `BaseLLM` class
3. Implement required methods (`_streamComplete`, `_streamChat`, etc.)
4. Add capability detection in `autodetect.ts`
5. Include tool support in `toolSupport.ts` if applicable

For complex providers, consider using the modular approach described above to maintain clear separation of concerns.

## Agent Functionality

Agent mode allows LLMs to use tools to accomplish tasks. To enable Agent support:

1. Include the provider in `PROVIDER_TOOL_SUPPORT` in `toolSupport.ts`
2. Implement proper tool handling in the provider's class
3. Support streaming tool calls in the `_streamChat` method
4. Add appropriate capabilities declaration:
   ```typescript
   static defaultOptions: Partial<LLMOptions> = {
     // ...
     capabilities: {
       tool_use: true
     }
   };
   ```

The framework automatically detects and enables Agent functionality for supported models like Claude 3.5/3.7, GPT-4, and others through the auto-detection system.

### Enhanced Agent Capabilities

The framework includes several features to enhance Agent functionality:

1. **Message Preprocessing**: Ensures tool calls and tool results are properly matched in conversations
2. **Tool Argument Repair**: Automatically detects and fixes malformed JSON in tool arguments
3. **Streaming Tool Calls**: Supports real-time streaming of tool calls and results
4. **Tool Result Standardization**: Normalizes tool results across different providers
5. **Error Recovery**: Maintains state during connection errors to resume tool operations
6. **File Operation Support**: Special handling for file operation tools like file creation and editing
7. **JSON Delta Processing**: Enhanced handling of partial JSON in streaming contexts using delta-based approaches
8. **Parallel Tool Call Control**: Options to control parallel tool call behavior to prevent duplicated JSON structures

## Orchestrator Pattern for Complex Providers

For complex providers like Databricks, the framework recommends using the orchestrator pattern to achieve clear responsibility separation:

1. **Main Provider Class as Orchestrator**:
   - Acts as a coordinator between specialized modules
   - Delegates detailed implementation to appropriate modules
   - Maintains high-level flow control and error handling
   - Implements BaseLLM interface methods

2. **Specialized Modules with Clear Responsibilities**:
   - Configuration Management: Handles API settings, validation, timeouts
   - Error Handling: Processes API errors, implements retry logic
   - Message Formatting: Converts between standard and provider-specific formats
   - Streaming: Processes chunked responses and manages streaming state
   - Tool Calls: Handles tool invocation and result processing
   - Helper Utilities: Provides shared functionality for other modules

3. **State Management**:
   - Clear ownership of state between modules
   - Immutable update patterns for state changes
   - Preservation of state during error recovery
   - Type-safe state interfaces

4. **Interface Standardization**:
   - Well-defined interfaces between modules
   - Consistent parameter and return types
   - Clear documentation of module responsibilities
   - Minimized dependencies between modules

This pattern promotes maintainability, testability, and code reuse while keeping the codebase organized and easy to understand. The Databricks implementation serves as a reference example of this pattern.

## Best Practices

### JSON Processing in Streaming Contexts

When handling JSON in streaming contexts (especially with tool calls), use the enhanced JSON utilities:

```typescript
import { safeJsonParse, extractValidJson, processJsonDelta } from "../utils/json.js";
import { JsonBufferHelpers } from "../utils/streamProcessing.js";

// Extract valid JSON from potentially mixed content
const validJson = extractValidJson(mixedContent);
if (validJson) {
  const parsedData = safeJsonParse(validJson, defaultValue);
  // Process clean JSON data
}

// For accumulating JSON fragments in streaming contexts
let buffer = JsonBufferHelpers.resetBuffer();
buffer = JsonBufferHelpers.addToBuffer(fragment, buffer, maxBufferSize);

// Check if buffer contains valid JSON
if (JsonBufferHelpers.isBufferComplete(buffer)) {
  const data = safeJsonParse(buffer, null);
  if (data !== null) {
    // Process complete JSON
    // Reset buffer
    buffer = JsonBufferHelpers.resetBuffer();
  }
}

// For delta-based JSON processing (Anthropic style)
const result = processJsonDelta(currentJson, deltaJson);
if (result.complete) {
  // Process complete JSON
  const data = safeJsonParse(result.combined, null);
  // Handle complete JSON object
} else {
  // Continue accumulating JSON fragments
}
```

### Message Content Type Handling

When working with message content that can be either string or an array of message parts, use the content extraction utility:

```typescript
import { extractContentAsString } from "../utils/messageUtils.js";

// Safely extract content as string regardless of type
const contentAsString = extractContentAsString(currentMessage.content);
```

This is especially important when comparing content or using it in contexts that expect string values. Many TypeScript compilation errors can be fixed by using this utility to safely handle MessageContent types.

### Error Handling and Retries

Implement consistent error handling with retry mechanisms for network issues:

```typescript
import { getErrorMessage, isConnectionError } from "../utils/errors.js";

// Basic error handling
try {
  // API call
} catch (error: unknown) {
  const errorMessage = getErrorMessage(error);
  
  if (isConnectionError(error)) {
    // Implement retry with exponential backoff
    const backoffTime = Math.min(initialBackoff * Math.pow(2, retryCount), maxBackoff);
    await new Promise(resolve => setTimeout(resolve, backoffTime));
    // Retry operation
  } else {
    // Handle other error types
  }
}

// Advanced error handling with state preservation
import { ErrorHandlingResult, StreamingState } from "./types";

function handleStreamingError(
  error: unknown,
  state: StreamingState
): ErrorHandlingResult {
  if (isConnectionError(error) || (error instanceof DOMException && error.name === 'AbortError')) {
    // Preserve state for retry
    return { 
      success: false, 
      error: error instanceof Error ? error : new Error(getErrorMessage(error)),
      state: { ...state }  // Keep the current state for recovery
    };
  } else {
    // Reset state for non-recoverable errors
    return { 
      success: false, 
      error: error instanceof Error ? error : new Error(getErrorMessage(error)),
      state: createInitialState()  // Reset state
    };
  }
}

// Generic retry mechanism
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  state?: Partial<StreamingState>
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
      
      // Calculate backoff time with exponential strategy
      const backoffTime = Math.min(1000 * Math.pow(2, retryCount - 1), 30000);
      console.log(`Retry ${retryCount}/${maxRetries} after ${backoffTime}ms`);
      await new Promise(resolve => setTimeout(resolve, backoffTime));
    }
  }
}
```

### Type Safety

Ensure proper type safety, especially with nullable values and array access:

```typescript
// Safe array access with boundary check
if (index !== null) {
  const numericIndex = Number(index);
  if (!Number.isNaN(numericIndex) && numericIndex >= 0 && numericIndex < array.length) {
    // Safe to access array[numericIndex]
  }
}

// Clear distinction between undefined and null
const result = maybeUndefined !== undefined ? maybeUndefined : defaultValue;

// Immutable updates for constant objects
const newState = {
  ...oldState,
  updatedProperty: newValue
};
```

### Common Type Issues and Solutions

When working with complex message content types:

```typescript
// Problem: Type 'MessageContent' is not assignable to type 'string'
// Type 'MessagePart[]' is not assignable to type 'string'
lastYieldedMessageContent = currentMessage.content; // Error!

// Solution: Use extractContentAsString utility
import { extractContentAsString } from "../utils/messageUtils.js";
lastYieldedMessageContent = extractContentAsString(currentMessage.content);

// When comparing message content:
// Problem:
if (currentMessage.content !== lastYieldedMessageContent) { /* ... */ }

// Solution:
const currentContentAsString = extractContentAsString(currentMessage.content);
if (currentContentAsString !== lastYieldedMessageContent) { /* ... */ }
```

### Tool Argument Repair

Always use the common utility function `repairToolArguments` for handling and repairing tool arguments:

```typescript
import { repairToolArguments } from "../utils/toolUtils.js";

// Instead of custom repair logic:
const repairedArgs = repairToolArguments(args);

// This utility will handle:
// - JSON validation
// - Duplicated pattern repair
// - Broken boolean values
// - Mismatched braces
// - And many other common JSON issues
```

### Modular Design and Responsibility Separation

For complex providers, follow these principles:

1. **Single Responsibility Principle**: Each module should have one clearly defined responsibility
2. **Orchestration Pattern**: Main provider class coordinates between specialized modules
3. **Clear Interfaces**: Define clear interfaces between modules
4. **Shared State Management**: Use immutable state patterns for data shared between modules
5. **Common Utility Usage**: Leverage shared utilities rather than reimplementing functionality
6. **Method Abstraction Levels**: Maintain consistent abstraction levels within methods and classes
7. **Error Handling Consistency**: Use standardized error handling approaches throughout the codebase
8. **Type Safety**: Utilize comprehensive type definitions for all interfaces and data structures

## 2025 May Updates

The framework has been enhanced with several improvements as of May 2025:

1. **Enhanced Message Content Type Handling**: Improved support for `MessageContent` type handling with better utilities to handle the string | MessagePart[] union type safely.

2. **Centralized Tool Arguments Repair**: Introduced a comprehensive `repairToolArguments` utility to handle various edge cases in malformed JSON.

3. **JSON Delta Processing Centralization**: Standardized the approach for handling incremental JSON updates in streaming contexts through the `processJsonDelta` utility.

4. **Boolean Value Repair in JSON**: Added specialized functions to repair common boolean value corruption issues in streaming contexts.

5. **Type-Safe Error Handling Improvements**: Enhanced error handling patterns to ensure type safety when dealing with unknown error types.

6. **Claude 3.7 Sonnet Thinking Mode Support**: Added full support for the thinking mode in Claude 3.7 Sonnet, including type definitions and processing logic.

7. **Streaming Response Handling Enhancements**: Improved compatibility with different response body formats across platforms.

8. **API URL Normalization and Validation**: Added utilities to ensure consistent and correct API endpoint resolution.

9. **Improved Databricks Claude 3.7 Integration**: Enhanced support for Databricks-hosted Claude 3.7 models with proper thinking mode handling and endpoint configuration. Key improvements include:
   - Intelligent extraction of parameters from `extra_body` to root level for Databricks compatibility
   - Automatic handling of both OpenAI-compatible client calls and direct REST API calls
   - Elimination of the `extra_body: Extra inputs are not permitted` error
   - Enhanced parameter validation and unsupported parameter filtering
   - Proper handling of array-based content structure in thinking mode responses
   - Improved type definitions for different response formats
   - Type-safe access to properties not defined in type definitions using type assertion
   - Complete exclusion of `parallel_tool_calls` parameter to prevent errors with Databricks endpoints

10. **Provider-specific Parameter Management**: Added improved validation and filtering of unsupported parameters for various providers.

11. **Enhanced Streaming Chunk Handling**: Updated type definitions to support various response formats:
    - Support for array-based content structure in streaming responses
    - Support for nested data structures in thinking mode responses
    - Support for both streaming and non-streaming responses with a single type definition

12. **Reconnection and State Management**: Added new type definitions and functionality to support recovery from connection errors:
    - `PersistentStreamState` for maintaining state during reconnection
    - `ReconnectionResult` for handling reconnection results
    - State preservation during retries for streaming operations

By following these best practices, you can ensure more robust and maintainable code across the LLM framework.
