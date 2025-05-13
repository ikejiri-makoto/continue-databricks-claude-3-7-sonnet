# Databricks LLM Integration for Continue

**重要**: このContinue VS Code拡張機能は以下のエンドポイントにのみ対応しています：

https://adb-xxxxxxxxxxxxxxxxx.x.azuredatabricks.net/serving-endpoints/databricks-claude-3-7-sonnet/invocations
※ Claude固有の機能（思考モードなど）を完全にサポートするモデル固有エンドポイント

以下のエンドポイントは**非対応**です：
https://adb-xxxxxxxxxxxxxxxxx.x.azuredatabricks.net/chat/completions
※ OpenAI互換APIですが、Claude固有機能が利用できません

This directory contains the implementation for connecting Continue VS Code extension to Databricks LLM services, particularly Claude 3.7 Sonnet. It enables access to Databricks-hosted models for code completion, explanation, refactoring, and other features within the Continue extension.

## 注意: TS2307: Cannot find module '../../config.js' エラーについて

**エラー解決方法**:
Anthropic.tsでのビルドエラー `Cannot find module '../../config.js'` が発生した場合は、以下の対応が必要です:

1. **config.js のインポート削除**:
   ```typescript
   // このインポート文を削除する
   import { config } from "../../config.js";
   ```

2. **apiBase の直接設定**:
   ```typescript
   static defaultOptions: Partial<LLMOptions> = {
     // ...
     // 以下のように直接URLを指定する
     apiBase: "https://adb-1981899174914086.6.azuredatabricks.net/serving-endpoints/databricks-claude-3-7-sonnet/invocations",
   };
   ```

これにより、不要なconfig依存を削除し、エンドポイントを直接指定することができます。

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

## Databricks-Specific Limitations

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

### Handling Thinking Role Messages

When working with ThinkingChatMessage objects, there are two approaches available:

1. **Complete Exclusion (Default)**: The default behavior completely excludes any messages with `role: "thinking"` from the request payload to Databricks.

2. **Conversion to System Messages**: An optional feature allows converting thinking messages to system messages to preserve their content. This can be useful for debugging or when the context of the thinking process needs to be maintained.

To use the conversion approach:

```typescript
// Filter out thinking messages completely (default)
const filteredMessages = MessageProcessor.validateAndFixMessageRoles(messages);

// Convert thinking messages to system messages
const convertedMessages = MessageProcessor.validateAndFixMessageRoles(messages, { preserveThinking: true });
```

The `preserveThinking` option modifies how thinking messages are processed:
- When `false` or undefined: Thinking messages are completely removed from the request
- When `true`: Thinking messages are converted to system messages with the prefix "Thinking process: "

This provides flexibility in how thinking content is handled while ensuring compatibility with Databricks endpoints.

### API Parameter Differences for Claude's Thinking Mode

**IMPORTANT**: Databricks endpoints have specific requirements for Claude's thinking mode implementation that differ from direct Anthropic API calls. The key differences are:

1. **Parameter Placement**: When using REST API directly with Databricks, the `thinking` parameter must be placed at the root level of the request, not within `extra_body`
2. **Model Names**: Require a `databricks-` prefix (e.g., `databricks-claude-3-7-sonnet` instead of `claude-3-7-sonnet-20240219`)
3. **Parameter Exclusion**: When disabling thinking mode, the `budget_tokens` parameter must be completely excluded (partial settings are not allowed)

#### REST API Request Format

```typescript
// Correct structure for Databricks REST API
{
  "model": "databricks-claude-3-7-sonnet",
  "messages": [ /* messages */ ],
  "max_tokens": 20000,
  "thinking": {
    "type": "enabled",
    "budget_tokens": 10240  // Must be less than max_tokens
  }
}
```

**Key Constraints**:
- `budget_tokens` should be smaller than `max_tokens`
- Minimum recommended value is 1,024 tokens
- For complex reasoning tasks, at least 4,000 tokens is recommended
- Values larger than 32K may not result in better performance

### About the `parallel_tool_calls`, `requestTimeout`, and `extra_body` Parameters

**IMPORTANT**: Databricks endpoints have several key parameter limitations:

1. **No Support for `parallel_tool_calls`**: This parameter (used by other providers like OpenAI) is not supported by Databricks endpoints and will cause errors.

2. **No Support for `requestTimeout`**: The `requestTimeout` parameter is not recognized by Databricks endpoints and will result in a `requestTimeout: Extra inputs are not permitted` error.

3. **No Support for `extra_body`**: Databricks endpoints reject requests with `extra_body` as a parameter. All parameters must be placed at the root level of the request.

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

## Code Structure and Maintenance

### Important Code Structure Guidelines

When working with the Databricks integration code, pay attention to these structural guidelines to avoid common syntax errors:

1. **Proper Block Nesting**: Always ensure that code blocks (defined by `{}`) are properly nested and closed. Missing closing braces are a common source of syntax errors that can be difficult to diagnose.

2. **`if` Block Termination**: Be particularly careful with conditional blocks in methods like `convertArgs()`. Each `if` statement must have its closing brace `}` before starting another code block.

3. **Method Structure**: The `DatabricksHelpers` class contains several critical methods that must be properly structured:
   - `convertArgs()`: Handles parameter transformation and validation
   - `removeUnsupportedParameters()`: Removes unsupported parameters from request objects
   - `processTools()`: Processes tool definitions for compatibility

4. **Code Formatting**: Use consistent indentation and formatting to make code structure more visible. This helps identify mismatched braces and improper nesting.

5. **TypeScript Compilation Checks**: Always run TypeScript compilation checks before committing changes, as they can catch many syntax and structural issues.

Example of proper block structure:
```typescript
if (isClaude37) {
    // Thinking mode settings and processing
    // ...
    // Make sure to close this block properly!
}

// Next block of code (outside the if block)
```

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

### Message Processing and Type Safety

#### Handling Special Message Types

When working with special message types like `ThinkingChatMessage`, follow these type safety guidelines:

```typescript
// Type-safe approach for handling thinking messages
if (message.role === "thinking") {
  // Ensure role property is properly typed as a string literal
  return {
    ...message,
    role: "thinking" as const // Use "as const" to define string literal type
  };
}
```

This approach ensures TypeScript correctly identifies the message as a `ThinkingChatMessage` type, which requires the `role` property to be exactly the string literal `"thinking"`.

#### Using Type Guards for Message Validation

Type guard functions are essential for preventing TypeScript errors when checking message roles:

```typescript
// Type guard function for ThinkingChatMessage
function isThinkingMessage(message: ChatMessage): boolean {
  return (message.role as string) === "thinking";
}

// Usage with type narrowing
if (isThinkingMessage(message)) {
  // TypeScript now knows this is a ThinkingChatMessage
  // Access ThinkingChatMessage-specific properties safely
}
```

This pattern avoids TypeScript errors like "This comparison appears to be unintentional because the types have no overlap" that occur when directly comparing roles that TypeScript doesn't think can match.

#### Solving the "No Overlap" TypeScript Error

A common TypeScript error when working with message roles is:

```
error TS2367: This comparison appears to be unintentional because the types '"user" | "assistant" | "system" | "tool"' and '"thinking"' have no overlap.
```

This occurs because TypeScript believes the `role` property can only be one of the defined valid roles, making the comparison with "thinking" appear meaningless.

Three solutions to this problem:

1. **Use a Type Guard Function** (Recommended):
   ```typescript
   // Define a type guard function
   static isThinkingMessage(message: ChatMessage): boolean {
     return (message.role as string) === "thinking";
   }
   
   // Use the type guard instead of direct comparison
   if (this.isThinkingMessage(message)) {
     // Process thinking message
   }
   ```

2. **Type Assertion for Direct Comparison**:
   ```typescript
   // Cast to string before comparison
   if ((message.role as string) !== "thinking") {
     // Process non-thinking message
   }
   ```

3. **String Literal Type Assertion**:
   ```typescript
   // Return with explicit string literal type
   return {
     ...message,
     role: "thinking" as const // Use "as const" for string literal type
   };
   ```

These approaches ensure type safety while still allowing the code to properly handle message roles that aren't directly represented in the TypeScript type definitions.

#### Fixing Common Type Errors

For message processing, avoid these common issues:

1. **String vs String Literal Types**: Ensure `role` properties use string literals with `as const` when required by interfaces
2. **Type Assertions for Return Values**: Use type assertions like `as ChatMessage[]` for return values when TypeScript cannot infer the correct type
3. **Explicit Types for Variables**: Use explicit type annotations for variables that will hold messages with special requirements

```typescript
// Explicit type annotations for message arrays
const fixedMessages: ChatMessage[] = messages.map(/* ... */);

// Return with type assertion when needed
return fixedMessages as ChatMessage[];
```

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
    "budget_tokens": 10240  // Must be less than max_tokens
  }
}
```

**Key Constraints**:
- `budget_tokens` should be smaller than `max_tokens`
- Minimum required value is 1,024 tokens
- For complex reasoning tasks, at least 4,000 tokens is recommended
- Values larger than 32K may not result in better performance

#### Response Processing for Thinking Mode

For streaming responses in thinking mode, the implementation uses a specialized extraction function to handle the nested data structure:

```typescript
/**
 * Extract thinking mode data from Claude 3.7 Sonnet
 * Actual data path: choices[0].delta.content[0].summary[0].text
 * @param chunk Streaming chunk
 * @returns Extracted thinking text and signature, or null
 */
private static extractThinkingData(chunk: StreamingChunk): { text: string; signature?: string } | null {
  if (!chunk?.choices?.[0]?.delta?.content) {
    return null;
  }
  
  // Process content as array
  const content = chunk.choices[0].delta.content;
  
  if (Array.isArray(content) && content.length > 0) {
    const firstContent = content[0];
    
    // Check for "reasoning" type with summary array
    if (typeof firstContent === 'object' && 
        firstContent !== null && 
        firstContent.type === "reasoning" && 
        Array.isArray(firstContent.summary) && 
        firstContent.summary.length > 0) {
      
      const summaryItem = firstContent.summary[0];
      
      // Check for "summary_text" type with text
      if (typeof summaryItem === 'object' && 
          summaryItem !== null && 
          summaryItem.type === "summary_text" && 
          typeof summaryItem.text === 'string') {
        
        return {
          text: summaryItem.text,
          signature: summaryItem.signature || undefined
        };
      }
    }
  }
  
  // Additional fallback processing...
}
```

This approach ensures reliable extraction and direct console output of thinking text:

```typescript
// Extract thinking data
const thinkingData = this.extractThinkingData(chunk);

if (thinkingData) {
  // Create thinking message
  const thinkingMessage: ThinkingChatMessage = {
    role: "thinking",
    content: thinkingData.text,
    signature: thinkingData.signature
  };
  
  // Output thinking text directly to console
  console.log(thinkingData.text);
  
  // Process result...
}
```

The implementation ensures that newlines (`\n`) in the thinking text are properly interpreted by the console, resulting in readable, formatted output.

### Solving the `[object Object]` Display Problem

The `[object Object]` display problem has been resolved using several techniques:

1. **Specialized Extraction Function**: Direct extraction of the text property from the structured response
2. **Type-Safe Property Access**: Careful navigation of nested properties with type checking
3. **Direct Console Output**: Simplified approach that directly outputs the text content

For thinking text display, the implementation:

1. Properly extracts the text from the nested structure
2. Directly outputs it to the console using `console.log()`
3. Preserves formatting including newlines (`\n`)
4. Outputs just the text without additional formatting or structure information

## Configuration

To use the Databricks integration, the following configuration is needed:

1. **API Base URL**: The connection URL to the Databricks endpoint
2. **API Key**: The Databricks API key for authentication

These can be configured in the `config.yaml` file:

```yaml
models:
  - name: "databricks-claude"
    provider: "databricks"
    apiBase: "https://adb-1981899174914086.6.azuredatabricks.net/serving-endpoints/databricks-claude-3-7-sonnet/invocations"
    apiKey: "dapi_your_api_key_here"
    model: "databricks-claude-3-7-sonnet"
```

**Important Notes**:
- The API base URL must always end with `/invocations`. The implementation will automatically normalize URLs by adding this suffix if missing.
- You can verify URL configuration in the console logs, which show the URL transformation via `DatabricksConfig.normalizeApiUrl` and `DatabricksConfig.getFullApiEndpoint`.

## Claude 3.7 Sonnet Thinking Mode Configuration

Claude 3.7 Sonnet models support thinking mode, which provides more detailed step-by-step reasoning. To enable this mode, configure as follows:

```yaml
models:
  - name: "databricks-claude"
    provider: "databricks"
    apiBase: "https://adb-1981899174914086.6.azuredatabricks.net/serving-endpoints/databricks-claude-3-7-sonnet/invocations"
    apiKey: "dapi_your_api_key_here"
    model: "databricks-claude-3-7-sonnet"
    completionOptions:
      thinking:
        type: "enabled"
        budget_tokens: 10240  # Optional: specify token budget (default is half of max_tokens)
```

Thinking mode is automatically detected and always enabled for Claude 3.7 models. When the model name includes "claude-3-7", the following special processing occurs:

1. **Thinking Mode Activation**: `thinking: { type: "enabled", budget_tokens: <budget> }` is added to the request
2. **Temperature Fixing**: The temperature parameter is fixed at 1.0 for optimal thinking mode performance
3. **Automatic Token Budget Calculation**: If not explicitly specified, half of `max_tokens` (up to 64000) is allocated as the token budget for the thinking process

This configuration allows Claude 3.7 Sonnet to display more detailed thinking processes and generate higher quality responses.

## Anthropic.ts Interface for Databricks

Using Anthropic provider with Databricks endpoints requires special care. In `Anthropic.ts`, you should:

1. **Set the correct API endpoint**:
   ```typescript
   static defaultOptions: Partial<LLMOptions> = {
     model: "claude-3-7-sonnet-20250219",
     // Other options...
     apiBase: "https://adb-1981899174914086.6.azuredatabricks.net/serving-endpoints/databricks-claude-3-7-sonnet/invocations",
   };
   ```

2. **Set thinking mode for Claude 3.7**:
   ```typescript
   // In convertArgs method
   const isClaude37 = modelName.includes("claude-3-7");
   // ...
   ...(isClaude37 ? {
     thinking: {
       type: "enabled",
       budget_tokens: 60000,
     }
   } : {})
   ```

3. **If using config.yaml-based configuration**:
   ```typescript
   // Do not use this due to import error:
   // import { config } from "../../config.js";
   
   // Instead, directly specify apiBase:
   apiBase: "https://adb-1981899174914086.6.azuredatabricks.net/serving-endpoints/databricks-claude-3-7-sonnet/invocations",
   ```

These settings ensure optimal compatibility with Databricks-hosted Claude 3.7 endpoints.

## Troubleshooting

### If `BAD_REQUEST: Invalid role in the chat message` Errors Occur

This error occurs when a message with an invalid role (such as "thinking") is sent to the Databricks endpoint. To fix this issue:

1. **Check Message Processing**: Ensure that `MessageProcessor.validateAndFixMessageRoles()` is properly filtering out thinking role messages:
   ```typescript
   // First filter out any "thinking" role messages
   const filteredMessages = messages.filter(message => message.role !== "thinking");
   ```

2. **Debug Message Roles**: Add logging to check the roles in your messages before sending:
   ```typescript
   console.log(`Message roles before filtering: ${messages.map(m => m.role).join(', ')}`);
   console.log(`Message roles after filtering: ${filteredMessages.map(m => m.role).join(', ')}`);
   ```

3. **Check Final Request**: Log the final request body to confirm no invalid roles are present:
   ```typescript
   console.log(`Final request message roles: ${requestBody.messages.map(m => m.role).join(', ')}`);
   ```

4. **Additional Validation Layer**: Add a final safeguard to filter any remaining invalid roles:
   ```typescript
   // Just before sending request, filter messages one last time
   requestBody.messages = requestBody.messages.filter(m => 
     ["system", "user", "assistant", "tool", "function"].includes(m.role)
   );
   ```

### If `Cannot find module '../../config.js'` Error Occurs

This error occurs when trying to import the config module in `Anthropic.ts`. To resolve this issue:

1. **Remove the import statement**:
   ```typescript
   // Remove this line
   import { config } from "../../config.js";
   ```

2. **Directly specify the apiBase**:
   ```typescript
   static defaultOptions: Partial<LLMOptions> = {
     // ...
     apiBase: "https://adb-1981899174914086.6.azuredatabricks.net/serving-endpoints/databricks-claude-3-7-sonnet/invocations",
   };
   ```

3. **If dynamic configuration is needed**:
   First check if an alternate config utility exists in the codebase. If none is available, simply use a hard-coded value or environment variable.

### If `requestTimeout: Extra inputs are not permitted` Errors Occur

This error specifically occurs when the `requestTimeout` parameter is included in requests to Databricks endpoints. To resolve this issue:

1. **Check Type Definitions**: Ensure the `requestTimeout` parameter has been completely removed from `DatabricksCompletionOptions` in the types definition

2. **Check Helper Implementation**: Verify that `DatabricksHelpers.convertArgs()` method does not add the `requestTimeout` parameter to the request

3. **Add to Unsupported Parameters**: Make sure `requestTimeout` is included in the `UNSUPPORTED_PARAMETERS` list in `DatabricksHelpers` class

4. **Log Request Bodies**: Use detailed logging to confirm the parameter isn't being sent:
   ```typescript
   console.log(`Databricks request parameters: ${Object.keys(requestBody).join(', ')}`);
   ```

5. **Inspect All Middleware**: Check any middleware or request transformation logic to ensure it's not adding this parameter

### If `extra_body: Extra inputs are not permitted` Errors Occur

This error occurs when the Databricks endpoint does not recognize the `extra_body` parameter. With the May 2025 update, this error should be resolved automatically as the implementation now extracts parameters from `extra_body` and places them at the root level using type assertion.

If you still encounter this error:

1. Ensure you're using the latest implementation with the May 2025 updates
2. Check that the `DatabricksHelpers.convertArgs()` method correctly processes the `extra_body` parameter
3. Enable detailed debug logging to see the exact request being sent

```yaml
# Enable debug logging (add to config.yaml)
debug: true
```

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
10. **Code Structure Validation**: Automated code structure checking to prevent missing braces and similar issues

This modularized architecture significantly improves the extension's stability and maintainability, making it easier to adapt to future API changes. The May 2025 improvements have resolved parameter handling issues, improved type safety and common utility usage. Most importantly, both the handling of parameters that aren't explicitly defined in type definitions (using type assertion) and Claude 3.7 Sonnet's thinking mode are now correctly handled with a more focused approach, eliminating previous errors and display issues.
