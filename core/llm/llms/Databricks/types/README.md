# Databricks LLM Integration - Type Definitions
正しいDatabricks Claude エンドポイントの形式
https://adb-xxxxxxxxxxxxxxxxx.x.azuredatabricks.net/serving-endpoints/databricks-claude-3-7-sonnet/invocations

This directory contains the type definitions used in the Databricks LLM integration. Type definitions play a crucial role in ensuring code safety, maintainability, and self-documentation.

Toolを使う場合のdatabricks-claude-3-7-sonnetへのリクエストとレスポンス形式は以下の階層になります。
=== REQUEST ===
URL: https://adb-1981899174914086.6.azuredatabricks.net/serving-endpoints/chat/completions
Method: POST
Request Body:
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


=== RESPONSE ===
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



Toolを使わない場合のdatabricks-claude-3-7-sonnetへのリクエストとレスポンス形式は以下の階層になります。
=== REQUEST ===
{
  "messages": [
    {
      "role": "system",
      "content": "\u3042\u306a\u305f\u306f\u5f79\u7acb\u3064AI\u30a2\u30b7\u30b9\u30bf\u30f3\u30c8\u3067\u3059\u3002"
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
  }
}

=== RESPONSE ===
{
  "id": "msg_bdrk_011G6sGXuygHpvP1Pwq8zwyp",
  "choices": [
    {
      "finish_reason": "stop",
      "index": 0,
      "logprobs": null,
      "message": {
        "content": [
          {
            "type": "reasoning",
            "summary": [
              {
                "type": "summary_text",
                "text": "東京の現在の天気を答えるには、リアルタイムの気象情報にアクセスする必要があります。しかし、私はAIアシスタントとして常にインターネットに接続しているわけではなく、リアルタイムデータにアクセスできません。また、私の知識は学習データの範囲内に限られており、定期的に更新されるものではありません。\n\nしたがって、正確な「現在の」東京の天気を伝えることはできません。この場合、以下のように回答するのが適切です：\n1. 正確な現在の天気情報を提供できないことを伝える\n2. 天気情報を確認する方法を提案する",
                "signature": "ErcBCkgIAxABGAIiQH1PzxtdFBdW6n/eiplr6ycZyzatn07G1634e6XJ562qt//N6XRNwADSLVsVvXlCmCLX/7id/8yt3B5f08I4okISDP2Pdt0cwPwb+iWdbRoMkrLVt4SHAdT9qbtBIjB4yNthPg3idwLVsoJzKCUcpTzdzVt5obZop8yK8CWs3JH60xD4vsHhSZmjWN58c+YqHW79NuybO34ovy/Xu4rNJkvC0bvqWmO1PlG8YPAN"
              }
            ]
          },
          {
            "type": "text",
            "text": "申し訳ありませんが、私はリアルタイムのインターネット接続や最新の気象データにアクセスすることができないため、東京の現在の正確な天気をお伝えすることができません。\n\n現在の天気を確認するには、以下の方法をお試しください：\n- 天気予報アプリをご確認ください\n- 天気予報のウェブサイト（気象庁やWeather News等）を参照してください\n- スマートフォンの天気アプリをご利用ください\n- テレビやラジオの天気情報をご確認ください\n\nお役に立てず申し訳ありません。他にお手伝いできることがあればお知らせください。"
          }
        ],
        "refusal": null,
        "role": "assistant",
        "annotations": null,
        "audio": null,
        "function_call": null,
        "tool_calls": null
      }
    }
  ],
  "created": 1747070352,
  "model": "us.anthropic.claude-3-7-sonnet-20250219-v1:0",
  "object": "chat.completion",
  "service_tier": null,
  "system_fingerprint": null,
  "usage": {
    "completion_tokens": 421,
    "prompt_tokens": 67,
    "total_tokens": 488,
    "completion_tokens_details": null,
    "prompt_tokens_details": null
  }
}

### Streaming Response Format for Thinking Mode

When using thinking mode with streaming responses, the data structure differs from non-streaming responses. The specific format for streaming thinking mode data in Databricks Claude 3.7 Sonnet is as follows:

```json
{
  "model": "us.anthropic.claude-3-7-sonnet-20250219-v1:0",
  "choices": [
    {
      "delta": {
        "role": "assistant",
        "content": [
          {
            "type": "reasoning",
            "summary": [
              {
                "type": "summary_text",
                "text": "分析を始めます。\n1. まず問題を確認します。\n2. 次に...",
                "signature": ""
              }
            ]
          }
        ]
      },
      "index": 0,
      "finish_reason": null
    }
  ],
  "usage": {
    "prompt_tokens": 2067,
    "completion_tokens": null,
    "total_tokens": null
  },
  "object": "chat.completion.chunk",
  "id": "msg_bdrk_01TarMA3TeEzQDfx6L4DFCLb",
  "created": 1747066395
}
```

The critical path for extracting thinking mode text in streaming responses is:
`choices[0].delta.content[0].summary[0].text`

Note the key differences from non-streaming responses:
1. `content` is an array, not an object
2. `summary` is also an array
3. Each element has type identifiers (`"type": "reasoning"` and `"type": "summary_text"`)

This structure must be properly handled to correctly extract and display thinking mode content.

## Important Notice

**IMPORTANT**: Databricks endpoints have several key parameter and message role limitations:

### Message Role Constraints

**CRITICAL**: Databricks endpoints only accept the following message roles:
- `system`
- `user`
- `assistant`
- `tool`
- `function`

**Common Error**: Sending messages with `role: "thinking"` will result in a `BAD_REQUEST: Invalid role in the chat message` error. The implementation now ensures:
1. All `thinking` role messages are excluded from the request payload before sending to Databricks
2. Thinking mode functionality is implemented through the `thinking` parameter at the root level of the request, not through message roles
3. Any other non-standard roles are converted to "assistant" to ensure compatibility

This is particularly important because thinking mode generates `ThinkingChatMessage` objects with `role: "thinking"`, which must be handled specially in the type system but can never be sent directly to Databricks.

### Parameter Limitations

1. **No Support for `parallel_tool_calls`**: This parameter (used by other providers like OpenAI) is not supported by Databricks endpoints and will cause errors.

2. **No Support for `requestTimeout`**: The `requestTimeout` parameter is not recognized by Databricks endpoints and will result in a `requestTimeout: Extra inputs are not permitted` error.

3. **No Support for `extra_body`**: Databricks endpoints reject requests with `extra_body` as a parameter. All parameters must be placed at the root level of the request. Our implementation handles this by extracting contents from `extra_body` and placing them at the root level using type assertion.

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
 * requestTimeout is also not supported by Databricks endpoints and has been removed
 */
export interface DatabricksCompletionOptions extends CompletionOptions {
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

#### Message Role Type Definitions

```typescript
/**
 * Valid message roles for Databricks endpoints
 * The only roles accepted by Databricks are: "system", "user", "assistant", "tool", "function"
 * The "thinking" role is NOT accepted by Databricks and must be filtered out before sending requests
 */
export type DatabricksValidRole = "system" | "user" | "assistant" | "tool" | "function";

/**
 * Chat message with role restricted to valid Databricks roles
 * Used to ensure only valid roles are sent to Databricks endpoints
 */
export interface DatabricksSafeMessage {
  role: DatabricksValidRole;
  content: string | any[];
  name?: string;
  tool_call_id?: string;
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

### 2. Support for Array-based Content Structure

Added support for the array-based content structure used in streaming thinking mode responses:

```typescript
// Updated StreamingChunk interface
export interface StreamingChunk {
  // ...existing properties
  
  // Support for array-based content structure
  choices?: Array<{
    delta?: {
      content?: string | any[] | { // Added array type to support content as array
        summary?: {
          text?: string;
        };
      };
    };
  }>;
}

// Type guard for array-based content
function isArrayContent(content: any): content is any[] {
  return Array.isArray(content);
}

// Helper function for extracting text from array-based content
function extractThinkingText(content: any[]): string | null {
  if (content.length > 0 && 
      typeof content[0] === 'object' && 
      content[0]?.type === 'reasoning' && 
      Array.isArray(content[0]?.summary) && 
      content[0].summary.length > 0 && 
      content[0].summary[0]?.type === 'summary_text') {
    return content[0].summary[0].text;
  }
  return null;
}
```

### 3. Added Definition for Valid Message Roles

A new type definition has been added to explicitly define the valid roles for Databricks endpoints:

```typescript
/**
 * Valid message roles for Databricks endpoints
 * Used to ensure only valid roles are sent to Databricks
 */
export type DatabricksValidRole = "system" | "user" | "assistant" | "tool" | "function";

/**
 * Chat message with role restricted to valid Databricks roles
 * Used to ensure type safety when sending messages to Databricks
 */
export interface DatabricksSafeMessage {
  role: DatabricksValidRole;
  content: string | any[];
  name?: string;
  tool_call_id?: string;
}
```

This explicit type definition helps prevent the `Invalid role in the chat message` error by providing compile-time checks for message roles.

### 4. Extended `ResponseDelta` Interface

Added `reasoning` property to the `ResponseDelta` interface to support Databricks endpoint-specific thinking data format:

```typescript
export interface ResponseDelta {
  tool_calls?: ToolCallDelta[];
  content?: string | { summary?: { text?: string; }; } | any[]; // Added array type
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

### 5. More Flexible `ThinkingChunk` Interface

The `ThinkingChunk` interface has been significantly extended to accommodate multiple data formats returned by Claude 3.7 Sonnet's thinking mode:

```typescript
export interface ThinkingChunk {
  thinking?: any;
  summary?: { text?: string; [key: string]: any; };
  content?: string | any[] | { summary?: { text?: string; [key: string]: any; }; [key: string]: any; }; // Added array type
  signature?: string;
  delta?: any;
  reasoning?: { text?: string; summary?: { text?: string; }; [key: string]: any; } | string;
  choices?: Array<{ delta?: { /* detailed structure */ }; [key: string]: any; }>;
  [key: string]: any; // Support for other unknown properties
}
```

This flexible type definition allows for properly handling various thinking data formats, specifically supporting:

1. `choices[0].delta.content[0].summary[0].text` format (streaming format)
2. `choices[0].delta.content.summary.text` format (alternative format)
3. `summary.text` format
4. `reasoning` object or string
5. Format with direct `thinking` property

### 6. Types for Reconnection and State Management

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

### 7. Complete Exclusion of `parallel_tool_calls` Parameter

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

### 8. Handling for Parameters Not Defined in Type Definitions

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

### 9. Added Support for Non-Streaming Responses

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

### 10. Removal of `requestTimeout` Parameter

The `requestTimeout` parameter has been completely removed from `DatabricksCompletionOptions` interface since it's not supported by Databricks endpoints and will cause errors. This ensures type safety by preventing the parameter from being included in requests at the type definition level.

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
content?: string | any[] | { summary?: { text?: string; }; [key: string]: any; }; // String, array, or object
reasoning?: { /* ... */ } | string;
```

### 4. Using Type Guard Functions

Type guard functions are implemented to safely determine types:

```typescript
private static isContentObject(content: any): content is { summary?: { text?: string } } {
  return typeof content === 'object' && content !== null;
}

private static isArrayContent(content: any): content is any[] {
  return Array.isArray(content);
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

### 6. Using String Literal Types for Roles

String literal types are used for message roles to ensure type safety:

```typescript
// Define valid roles as string literals
export type DatabricksValidRole = "system" | "user" | "assistant" | "tool" | "function";

// Use string literal assertions when setting roles
return {
  ...message,
  role: "assistant" as DatabricksValidRole
};
```

This ensures that only valid roles can be assigned to messages sent to Databricks endpoints.

## Troubleshooting Type Errors

Common type errors and their solutions:

### 1. `BAD_REQUEST: Invalid role in the chat message` Error

This runtime error occurs when sending a message with an invalid role like "thinking" to Databricks. To fix:

1. Use the `DatabricksValidRole` type to ensure only valid roles are used:
   ```typescript
   function isValidDatabricksRole(role: string): role is DatabricksValidRole {
     return ["system", "user", "assistant", "tool", "function"].includes(role);
   }
   ```

2. Filter out thinking messages before sending to Databricks:
   ```typescript
   // Filter out thinking messages
   const databricksMessages = messages.filter(m => m.role !== "thinking");
   ```

3. Convert invalid roles to valid ones:
   ```typescript
   const sanitizedMessages = databricksMessages.map(m => {
     if (!isValidDatabricksRole(m.role)) {
       return { ...m, role: "assistant" as DatabricksValidRole };
     }
     return m;
   });
   ```

### 2. `Property 'signature' does not exist on type 'StreamingChunk'`

This error occurs when the `signature` property is not defined in the `StreamingChunk` interface. To resolve, add the property to the interface:

```typescript
export interface StreamingChunk {
  // Other properties...
  signature?: string; // Add signature information
  // ...
}
```

### 3. `Property 'reasoning' does not exist on type 'ResponseDelta & {...}'`

This error occurs when the `reasoning` property is not defined in the `ResponseDelta` interface. The solution:

```typescript
export interface ResponseDelta {
  // Other properties...
  reasoning?: { text?: string; summary?: { text?: string; }; /* ... */ } | string;
  // ...
}
```

### 4. `Type 'MessageContent' is not assignable to type 'string'`

This common error occurs when trying to assign the `content` property to a string variable. The solution is to use the common utility function:

```typescript
import { extractContentAsString } from "../../utils/messageUtils.js";

// Correct approach
const contentAsString = extractContentAsString(message.content);
```

### 5. `Property 'extra_body' does not exist on type 'CompletionOptions'`

This error occurs when trying to access the `extra_body` property which isn't defined in the `CompletionOptions` interface. The solution is to use type assertion:

```typescript
// Type assertion to access extra_body property
const optionsAny = options as any;
if (optionsAny.extra_body) {
  // ...
}
```

### 6. `Property 'message' does not exist on type '{...}'`

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

### 7. `Type 'any[]' is not assignable to type 'string | { summary?: { text?: string; }; }'`

This error occurs when trying to handle array-based content structure. The solution is to update the type definition to include array type:

```typescript
content?: string | any[] | { summary?: { text?: string; }; [key: string]: any; };
```

### 8. `requestTimeout: Extra inputs are not permitted` Error

This error occurs at runtime when the `requestTimeout` parameter is included in requests to Databricks endpoints. The solution includes:

1. Removing the `requestTimeout` parameter from the `DatabricksCompletionOptions` interface
2. Ensuring `requestTimeout` is included in the `UNSUPPORTED_PARAMETERS` list in `DatabricksHelpers` class
3. Modifying `DatabricksHelpers.convertArgs()` to not add this parameter to requests
4. Using detailed logging to verify the parameter is not included in requests

### 9. `Type 'string' is not assignable to type 'DatabricksValidRole'`

This error occurs when trying to assign a string to a variable of type `DatabricksValidRole`. The solution is to use type assertion or a type guard:

```typescript
// Type assertion approach
const role = "assistant" as DatabricksValidRole;

// Type guard approach
function isValidDatabricksRole(role: string): role is DatabricksValidRole {
  return ["system", "user", "assistant", "tool", "function"].includes(role);
}

if (isValidDatabricksRole(role)) {
  // Use role here - TypeScript knows it's a valid role
}
```

### 10. `This comparison appears to be unintentional because the types have no overlap`

This TypeScript error occurs when comparing types that TypeScript thinks cannot be the same. For example, when comparing a string literal type with a value that TypeScript thinks can't be that literal:

```typescript
// Error: This comparison appears to be unintentional because the types 
// '"user" | "assistant" | "system" | "tool"' and '"thinking"' have no overlap
if (message.role !== "thinking") { /* ... */ }
```

The solution is to use a type guard function or a type assertion:

```typescript
// Type guard solution
function isThinkingMessage(message: ChatMessage): boolean {
  return (message.role as string) === "thinking";
}

if (!isThinkingMessage(message)) { /* ... */ }

// OR type assertion solution
if ((message.role as string) !== "thinking") { /* ... */ }
```

## Future Type Definition Enhancements

Planned improvements to type definitions:

1. **Message Role Type Safety**: Further refinements to message role type safety:
   - Stricter validation for role values at compile time
   - Runtime checks before message processing
   - Helper functions for role conversion and validation

2. **More Precise Type Definitions**: Introducing more specific and strict types to improve type inference accuracy
3. **Optimized Recursive Type Definitions**: Refining type definitions for complex nested structures
4. **Utilizing Conditional Types**: Introducing conditional types for more flexible type transformations under specific conditions
5. **Enhanced Type-Level Validation**: Expressing constraints on value ranges and formats at the type level
6. **Further Utilizing Generic Types**: Leveraging generic types for improved balance between versatility and type safety

These type definition enhancements will further improve code safety and maintainability, allowing developers to write more reliable code more efficiently.
