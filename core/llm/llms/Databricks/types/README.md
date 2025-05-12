# Databricks LLM Integration - Type Definitions

This directory contains the type definitions used in the Databricks LLM integration. Type definitions play a crucial role in ensuring code safety, maintainability, and self-documentation.

## Response Format Structure
The Databricks Claude 3.7 Sonnet response structure follows this hierarchy:

=== REQUEST ===
URL: https://adb-1981899174914086.6.azuredatabricks.net/serving-endpoints/chat/completions
Method: POST
Request Body:
```json
{
  "messages": [
    {
      "role": "system",
      "content": "\u3042\u306a\u305f\u306f\u5f79\u7acb\u3064AI\u30a2\u30b7\u30b9\u30bf\u30f3\u30c8\u3067\u3059\u3002\u5fc5\u8981\u306b\u5fdc\u3058\u3066\u30c4\u30fc\u30eb\u3092\u4f7f\u7528\u3057\u3066\u304f\u3060\u3055\u3044\u3002"
    },
    {
      "role": "user",
      "content": "\u6771\u4eac\u306e\u73fe\u5728\u306e\u5929\u6c17\u3092\u6559\u3048\u3066\u304f\u3060\u3055\u3044\u3002"
    }
  ],
  "model": "databricks-claude-3-7-sonnet",
  "max_tokens": 20480,
  "thinking": {
    "type": "enabled",
    "budget_tokens": 10240
  },
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "\u6307\u5b9a\u3055\u308c\u305f\u5834\u6240\u306e\u73fe\u5728\u306e\u5929\u6c17\u60c5\u5831\u3092\u53d6\u5f97\u3057\u307e\u3059",
        "parameters": {
          "type": "object",
          "properties": {
            "location": {
              "type": "string",
              "description": "\u5929\u6c17\u60c5\u5831\u3092\u53d6\u5f97\u3057\u305f\u3044\u5834\u6240\uff08\u90fd\u5e02\u540d\u306a\u3069\uff09"
            },
            "unit": {
              "type": "string",
              "enum": [
                "celsius",
                "fahrenheit"
              ],
              "description": "\u6e29\u5ea6\u306e\u5358\u4f4d\uff08\u30c7\u30d5\u30a9\u30eb\u30c8\u306fcelsius\uff09"
            }
          },
          "required": [
            "location"
          ]
        }
      }
    }
  ],
  "tool_choice": "auto"
}
```

=== RESPONSE ===
```json
{
  "id": "msg_bdrk_01LYsYW3RFFdEPVAUedC8u9Z",
  "choices": [
    {
      "finish_reason": "tool_calls",
      "index": 0,
      "logprobs": null,
      "message": {
        "content": [
          {
            "type": "reasoning",
            "summary": [
              {
                "type": "summary_text",
                "text": "ユーザーは東京の現在の天気情報を求めています。この要求に応えるために、`get_weather`関数を使用できます。\n\n必要なパラメータを確認します:\n- `location`: 天気情報を取得したい場所 - ここでは「東京」\n- `unit`: 温度の単位（オプション） - 特に指定がないのでデフォルトの「celsius」を使用します\n\nすべての必要なパラメータが揃っているので、関数を呼び出すことができます。",
                "signature": "ErcBCkgIAxABGAIiQJRb7rpeYhLuVXSlxfIHPJFPotgUggyiJtTD/yrh9tbsalPfYlUxd19qGN8Mw0h9qtVYaKumTUV1+poeEJr+O84SDE0ulR1K6D1DdxhuohoMKALNPo8f58U2MwpCIjBdDBZlOh4Obw72bwTyCtrHWdfykx6BWTHIk4g7V2uw8Kq353TP6NBaEeFLd3cBnXoqHYWWziyouz6GV9yzilEcU26WC4uwKZb2S1MdqTQn"
              }
            ]
          },
          {
            "type": "text",
            "text": "東京の現在の天気情報を取得します。"
          }
        ],
        "refusal": null,
        "role": "assistant",
        "annotations": null,
        "audio": null,
        "function_call": null,
        "tool_calls": [
          {
            "id": "toolu_bdrk_01LMiseooSF8SyS9cUgheyUy",
            "function": {
              "arguments": "{\"location\":\"東京\"}",
              "name": "get_weather"
            },
            "type": "function"
          }
        ]
      }
    }
  ],
  "created": 1747060157,
  "model": "us.anthropic.claude-3-7-sonnet-20250219-v1:0",
  "object": "chat.completion",
  "service_tier": null,
  "system_fingerprint": null,
  "usage": {
    "completion_tokens": 231,
    "prompt_tokens": 703,
    "total_tokens": 934,
    "completion_tokens_details": null,
    "prompt_tokens_details": null
  }
}
```

## Important Notice

**IMPORTANT**: Databricks endpoints do not support the `parallel_tool_calls` parameter. This parameter has been intentionally excluded from the Databricks type definitions, and using it will cause errors.

**IMPORTANT**: Databricks endpoints also do not support the `extra_body` parameter. Parameters must be placed at the root level of the request. Our implementation handles this by extracting contents from `extra_body` and placing them at the root level using type assertion.

## Directory Structure

```
types/
├── index.ts         # Entry point for all type definitions
├── types.ts         # Implementation of detailed type definitions
└── extension.d.ts   # Type extension definitions
```

## Key Type Definitions

### `index.ts`

This file serves as the entry point for all type definitions and exports the types used by other modules:

```typescript
// Import and export type definitions
export * from "./types";

// Explicit exports (for IDE completion)
export type { 
  DatabricksLLMOptions,
  DatabricksCompletionOptions, 
  ToolCall, 
  ToolResultMessage,
  DatabricksChatMessage,
  StreamingChunk,
  PersistentStreamState,
  StreamingResult,
  ToolCallProcessorInterface,
  ToolCallResult,
  ToolCallDelta,
  ErrorHandlingResult,
  StreamingState,
  ThinkingChunk,
  StreamingResponseResult,
  ReconnectionResult
} from "./types";
```

### `types.ts`

This file contains the main type definitions for the Databricks integration:

#### Databricks-Specific Options

```typescript
/**
 * Databricks LLM-specific options type
 * parallel_tool_calls is not included as it's not supported by Databricks endpoints
 */
export interface DatabricksLLMOptions extends LLMOptions {
  apiBase?: string;
  apiKey?: string;
  alwaysLogThinking?: boolean;
}

/**
 * Databricks completion options type for requests
 * parallel_tool_calls is not included as it's not supported by Databricks endpoints
 */
export interface DatabricksCompletionOptions extends CompletionOptions {
  /**
   * Request timeout in seconds
   * Default is 300 seconds (5 minutes)
   */
  requestTimeout?: number;
  
  /**
   * API Base URL
   */
  apiBase?: string;
  
  /**
   * API Key
   */
  apiKey?: string;
  
  /**
   * Thinking mode configuration for Claude 3.7 models
   * Enables and configures thinking process
   */
  thinking?: {
    /**
     * Thinking mode type - currently only "enabled" is supported
     */
    type: string;
    
    /**
     * Token budget for thinking process
     * Default is half of max_tokens (up to 64000)
     */
    budget_tokens?: number;
  };
}
```

#### Tool-Related Type Definitions

```typescript
/**
 * Tool call type
 */
export interface ToolCall {
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * Tool result message type
 */
export interface ToolResultMessage {
  role: string;
  tool_call_id: string;
  content: string;
}

/**
 * Tool call delta in streaming chunk
 */
export interface ToolCallDelta {
  index: number;
  id?: string;
  type?: string; // Added type property to ensure type compatibility
  function?: {
    name?: string;
    arguments?: string;
  };
}
```

#### Streaming-Related Type Definitions

```typescript
/**
 * Response delta in streaming
 * Supports Claude 3.7 Sonnet thinking mode and reasoning type
 */
export interface ResponseDelta {
  tool_calls?: ToolCallDelta[];
  content?: string | {
    summary?: {
      text?: string;
    };
  };
  signature?: string;
  // Support for reasoning type (Databricks endpoint specific thinking data format)
  reasoning?: {
    text?: string;
    summary?: {
      text?: string;
    };
    signature?: string;
    [key: string]: any; // Support for other properties
  } | string;
}

/**
 * Streaming chunk type
 * Handles various response formats from Databricks endpoints
 */
export interface StreamingChunk {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  signature?: string; // Added signature information
  thinking?: any; // Thinking data can come in various formats, hence any type
  // Support for content type - object format data can come at any level
  content?: {
    summary?: {
      text?: string;
    };
    [key: string]: any;
  } | string;
  // Choices array that may contain thinking data
  choices?: Array<{
    index?: number;
    delta?: ResponseDelta & {
      content?: string | {
        summary?: {
          text?: string;
        };
      }; // Support for nested structures like content.summary.text
      reasoning?: {
        text?: string;
        summary?: {
          text?: string;
        };
        signature?: string;
        [key: string]: any;
      } | string;
    };
    // Non-streaming response message property
    message?: {
      content?: any; // Support for arrays, objects, strings, etc.
      role?: string;
      tool_calls?: ToolCall[];
      refusal?: any;
      annotations?: any;
      audio?: any;
      function_call?: any;
      [key: string]: any; // Support for other properties
    };
    finish_reason?: string | null;
  }>;
  // Direct access for summary
  summary?: {
    text?: string;
    [key: string]: any;
  };
}
```

#### Thinking Mode Related Type Definitions

```typescript
/**
 * Thinking chunk type - enhanced version
 * Flexible type definition to accommodate various thinking data structures
 * Supports multiple data formats returned by Claude 3.7 Sonnet thinking mode
 */
export interface ThinkingChunk {
  /** Direct thinking data (can be passed in various formats) */
  thinking?: any;
  
  /** Thinking data in summary.text format */
  summary?: { 
    text?: string;
    [key: string]: any;
  };
  
  /** Thinking data in content.summary.text format */
  content?: string | { 
    summary?: { 
      text?: string;
      [key: string]: any;
    };
    [key: string]: any;
  };
  
  /** Signature information for thinking data */
  signature?: string;
  
  /** Delta format thinking data */
  delta?: any;
  
  /** Reasoning format thinking data (Databricks specific) */
  reasoning?: {
    text?: string;
    summary?: {
      text?: string;
    };
    [key: string]: any;
  } | string;
  
  /** Thinking data in choices[0].delta.content.summary.text format (highest priority)*/
  choices?: Array<{
    delta?: {
      content?: {
        summary?: {
          text?: string;
          [key: string]: any;
        };
        [key: string]: any;
      };
      reasoning?: {
        text?: string;
        summary?: {
          text?: string;
        };
        [key: string]: any;
      } | string;
      signature?: string;
      [key: string]: any;
    };
    [key: string]: any;
  }>;
  
  /** Support for other unknown properties */
  [key: string]: any;
}
```

#### State Management Related Type Definitions

```typescript
/**
 * Streaming state tracking type
 */
export interface StreamingState {
  message: ChatMessage;
  toolCalls: ToolCall[];
  currentToolCall: ToolCall | null;
  currentToolCallIndex: number | null;
  jsonBuffer: string;
  isBufferingJson: boolean;
}

/**
 * Persistent stream state type
 * Used to restore state during reconnection
 */
export interface PersistentStreamState {
  jsonBuffer: string;
  isBufferingJson: boolean;
  toolCallsInProgress: ToolCall[];
  currentToolCallIndex: number | null;
  contentBuffer: string;
  lastReconnectTimestamp: number;
}
```

#### Result Types and Processing Interfaces

```typescript
/**
 * Error handling result type
 */
export interface ErrorHandlingResult {
  success: boolean;
  error: Error;
  state?: StreamingState;
}

/**
 * Databricks chat message type
 * Added to resolve export errors
 */
export interface DatabricksChatMessage {
  role: string;
  content: string | any[];
  name?: string;
  toolCalls?: ToolCall[];
}

/**
 * Streaming result type
 */
export interface StreamingResult {
  updatedMessage: ChatMessage;
  shouldYield: boolean;
}

/**
 * Tool call processor interface
 */
export interface ToolCallProcessorInterface {
  preprocessToolCallsAndResults(messages: ChatMessage[]): ChatMessage[];
}

/**
 * Tool call result type
 */
export interface ToolCallResult {
  updatedToolCalls: ToolCall[];
  updatedCurrentToolCall: ToolCall | null;
  updatedCurrentToolCallIndex: number | null;
  updatedJsonBuffer: string;
  updatedIsBufferingJson: boolean;
  shouldYieldMessage: boolean;
}

/**
 * Streaming response processing result type
 */
export interface StreamingResponseResult {
  success: boolean;
  messages: ChatMessage[];
  error?: Error;
  state?: any;
}

/**
 * Reconnection result type
 */
export interface ReconnectionResult {
  restoredMessage: ChatMessage;
  restoredToolCalls: ToolCall[];
  restoredCurrentToolCall: ToolCall | null;
  restoredCurrentToolCallIndex: number | null;
  restoredJsonBuffer: string;
  restoredIsBufferingJson: boolean;
}
```

### `extension.d.ts`

This file extends core type definitions to accommodate Databricks-specific requirements:

```typescript
// This file defines extensions to core types
// Required to support Databricks-specific features

// Add Databricks-specific options
declare module "../index" {
  // Extend ChatMessage type with tool-calling related properties
  interface ChatMessage {
    /**
     * Tool call ID associated with a tool result
     * Used in tool result messages (role: "tool")
     */
    toolCallId?: string;
    
    /**
     * Signature information for thinking messages
     * Used in thinking process (role: "thinking")
     */
    signature?: string;
    
    /**
     * Redacted thinking data
     * Non-public part of thinking process
     */
    redactedThinking?: any;
  }

  interface LLMOptions {
    /**
     * Whether to always log thinking process
     * If true, always log; if false, only log in development mode
     */
    thinkingProcess?: boolean;
    
    /**
     * API Base URL
     * Base URL for Databricks endpoint
     */
    apiBase?: string;
    
    /**
     * API Key
     * API key for authenticating with Databricks endpoint
     */
    apiKey?: string;
    
    /**
     * Whether to always log thinking process
     */
    alwaysLogThinking?: boolean;
    
    // Note: Databricks endpoints do not support the parallel_tool_calls parameter
    // Including this parameter will cause errors
    // parallel_tool_calls parameter intentionally commented out
    // parallelToolCalls?: boolean;
  }

  // Add extension for CompletionOptions
  interface CompletionOptions {
    /**
     * Thinking mode configuration for Claude 3.7 models
     * Enables and configures thinking process
     */
    thinking?: {
      /**
       * Thinking mode type - currently only "enabled" is supported
       */
      type: string;
      
      /**
       * Token budget for thinking process
       * Default is half of max_tokens (up to 64000)
       */
      budget_tokens?: number;
    };
  }

  // Extend ThinkingChatMessage with required properties
  interface ThinkingChatMessage extends ChatMessage {
    /**
     * Signature information for thinking process
     */
    signature?: string;
    
    /**
     * Summary of thinking process result
     */
    summary?: {
      text?: string;
    };
    
    /**
     * Delta updates for thinking process
     */
    delta?: any;
    
    /**
     * Choices information for thinking process
     */
    choices?: Array<{
      delta?: {
        content?: {
          summary?: {
            text?: string;
          };
        };
        signature?: string;
      };
    }>;
  }
}
```

## Key Type Definition Updates in May 2025

This update includes several important extensions and improvements to type definitions:

### 1. Enhanced `StreamingChunk` Interface

The `StreamingChunk` interface has been extended to handle various response formats that Databricks endpoints may return:

```typescript
export interface StreamingChunk {
  // Existing properties
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  
  // Newly added properties
  signature?: string; // Added signature information
  thinking?: any; // Thinking data (can come in various formats)
  content?: { summary?: { text?: string; }; [key: string]: any; } | string; // Support for object-format content
  summary?: { text?: string; [key: string]: any; }; // For direct access
  
  // Extended choices structure
  choices?: Array<{
    index?: number;
    delta?: ResponseDelta & {
      content?: string | { summary?: { text?: string; }; };
      reasoning?: { text?: string; summary?: { text?: string; }; signature?: string; [key: string]: any; } | string;
    };
    // Non-streaming response message property
    message?: {
      content?: any; // Support for arrays, objects, strings, etc.
      role?: string;
      tool_calls?: ToolCall[];
      refusal?: any;
      annotations?: any;
      audio?: any;
      function_call?: any;
      [key: string]: any; // Support for other properties
    };
    finish_reason?: string | null;
  }>;
}
```

### 2. Extended `ResponseDelta` Interface

Added `reasoning` property to the `ResponseDelta` interface to support Databricks endpoint-specific thinking data format:

```typescript
export interface ResponseDelta {
  tool_calls?: ToolCallDelta[];
  content?: string | { summary?: { text?: string; }; };
  signature?: string;
  
  // Added reasoning type (Databricks-specific thinking data format)
  reasoning?: {
    text?: string;
    summary?: { text?: string; };
    signature?: string;
    [key: string]: any;
  } | string;
}
```

### 3. More Flexible `ThinkingChunk` Interface

The `ThinkingChunk` interface has been significantly extended to accommodate multiple data formats returned by Claude 3.7 Sonnet's thinking mode:

```typescript
export interface ThinkingChunk {
  thinking?: any;
  summary?: { text?: string; [key: string]: any; };
  content?: string | { summary?: { text?: string; [key: string]: any; }; [key: string]: any; };
  signature?: string;
  delta?: any;
  reasoning?: { text?: string; summary?: { text?: string; }; [key: string]: any; } | string;
  choices?: Array<{ delta?: { /* detailed structure */ }; [key: string]: any; }>;
  [key: string]: any; // Support for other unknown properties
}
```

This flexible type definition allows for properly handling various thinking data formats, specifically supporting:

1. `choices[0].delta.content.summary.text` format (most common)
2. `content.summary.text` format
3. `summary.text` format
4. `reasoning` object or string
5. Format with direct `thinking` property

### 4. Types for Reconnection and State Management

Added new type definitions to support recovery from connection errors during streaming:

```typescript
export interface ReconnectionResult {
  restoredMessage: ChatMessage;
  restoredToolCalls: ToolCall[];
  restoredCurrentToolCall: ToolCall | null;
  restoredCurrentToolCallIndex: number | null;
  restoredJsonBuffer: string;
  restoredIsBufferingJson: boolean;
}

export interface PersistentStreamState {
  jsonBuffer: string;
  isBufferingJson: boolean;
  toolCallsInProgress: ToolCall[];
  currentToolCallIndex: number | null;
  contentBuffer: string;
  lastReconnectTimestamp: number;
}
```

### 5. Complete Exclusion of `parallel_tool_calls` Parameter

Since Databricks endpoints don't support the `parallel_tool_calls` parameter, it has been completely excluded from the type definitions:

```typescript
interface LLMOptions {
  // Other properties...
  
  // Note: Databricks endpoints do not support the parallel_tool_calls parameter
  // Including this parameter will cause errors
  // parallel_tool_calls parameter intentionally commented out
  // parallelToolCalls?: boolean;
}
```

This change prevents type errors during use and improves code safety.

### 6. Handling for Parameters Not Defined in Type Definitions

For some parameters like `extra_body` that are needed for compatibility but aren't officially supported by Databricks endpoints, we use type assertion in the implementation:

```typescript
// Type-safe access to extra_body using type assertion
const optionsAny = options as any;
      
// Extract thinking mode parameters from extra_body, if present
if (optionsAny.extra_body && 
    typeof optionsAny.extra_body === 'object' && 
    optionsAny.extra_body.thinking) {
  args.thinking = optionsAny.extra_body.thinking;
}
```

This approach allows us to maintain type safety while still supporting the required functionality.

### 7. Added Support for Non-Streaming Responses

With the May 2025 update, support has been added for non-streaming responses from Databricks endpoints. This is implemented through the addition of a `message` property in the `choices` array of the `StreamingChunk` interface:

```typescript
message?: {
  content?: any; // Support for arrays, objects, strings, etc.
  role?: string;
  tool_calls?: ToolCall[];
  refusal?: any;
  annotations?: any;
  audio?: any;
  function_call?: any;
  [key: string]: any; // Support for other properties
};
```

This allows the implementation to handle both streaming responses (using the `delta` property) and non-streaming responses (using the `message` property) with a single interface, improving code maintainability and type safety.

## Type Safety Best Practices

Type safety best practices adopted in the Databricks integration:

### 1. Using Index Signatures

Index signatures are used to flexibly handle unknown properties:

```typescript
export interface ThinkingChunk {
  // Known properties...
  
  /** Support for other unknown properties */
  [key: string]: any;
}
```

### 2. Using Optional Properties

Most properties are defined as optional (`?:`) to accommodate various data structures:

```typescript
content?: { 
  summary?: { 
    text?: string;
    [key: string]: any;
  };
  [key: string]: any;
};
```

### 3. Using Type Unions

Type unions are used when either string or object type may be received:

```typescript
content?: string | { summary?: { text?: string; }; [key: string]: any; };
reasoning?: { /* ... */ } | string;
```

### 4. Using Type Guard Functions

Type guard functions are implemented to safely determine types:

```typescript
private static isContentObject(content: any): content is { summary?: { text?: string } } {
  return typeof content === 'object' && content !== null;
}
```

### 5. Using Type Assertion

Type assertion is used when accessing properties not defined in the type definitions:

```typescript
// Type assertion to safely access extra_body property
const optionsAny = options as any;
if (optionsAny.extra_body) {
  // ...
}
```

## Troubleshooting Type Errors

Common type errors and their solutions:

### 1. `Property 'signature' does not exist on type 'StreamingChunk'`

This error occurs when the `signature` property is not defined in the `StreamingChunk` interface. To resolve, add the property to the interface:

```typescript
export interface StreamingChunk {
  // Other properties...
  signature?: string; // Add signature information
  // ...
}
```

### 2. `Property 'reasoning' does not exist on type 'ResponseDelta & {...}'`

This error occurs when the `reasoning` property is not defined in the `ResponseDelta` interface. The solution:

```typescript
export interface ResponseDelta {
  // Other properties...
  reasoning?: { text?: string; summary?: { text?: string; }; /* ... */ } | string;
  // ...
}
```

### 3. `Type 'MessageContent' is not assignable to type 'string'`

This common error occurs when trying to assign the `content` property to a string variable. The solution is to use the common utility function:

```typescript
import { extractContentAsString } from "../../utils/messageUtils.js";

// Correct approach
const contentAsString = extractContentAsString(message.content);
```

### 4. `Property 'extra_body' does not exist on type 'CompletionOptions'`

This error occurs when trying to access the `extra_body` property which isn't defined in the `CompletionOptions` interface. The solution is to use type assertion:

```typescript
// Type assertion to access extra_body property
const optionsAny = options as any;
if (optionsAny.extra_body) {
  // ...
}
```

### 5. `Property 'message' does not exist on type '{...}'`

This error occurs when trying to access the `message` property in the `choices` array of a `StreamingChunk` object. The solution is to make sure the `message` property is defined in the interface:

```typescript
choices?: Array<{
  // Other properties...
  message?: {
    content?: any;
    // Other properties...
  };
  // ...
}>;
```

## Future Type Definition Enhancements

Planned improvements to type definitions:

1. **More Precise Type Definitions**: Introducing more specific and strict types to improve type inference accuracy
2. **Optimized Recursive Type Definitions**: Refining type definitions for complex nested structures
3. **Utilizing Conditional Types**: Introducing conditional types for more flexible type transformations under specific conditions
4. **Enhanced Type-Level Validation**: Expressing constraints on value ranges and formats at the type level
5. **Further Utilizing Generic Types**: Leveraging generic types for improved balance between versatility and type safety

These type definition enhancements will further improve code safety and maintainability, allowing developers to write more reliable code more efficiently.
