import { MessageProcessor } from '../../../llms/Databricks/messages';
import { ChatMessage } from '../../../../index';

// テスト用のモックデータ
const mockMessages: ChatMessage[] = [
  { role: 'system', content: 'You are a helpful assistant.' },
  { role: 'user', content: 'Hello, how are you?' },
  { role: 'assistant', content: 'I am doing well, thank you for asking!' },
  { role: 'user', content: 'Can you help me with a task?' },
];

const mockMessagesWithToolCalls: ChatMessage[] = [
  ...mockMessages,
  {
    role: 'assistant',
    content: 'I can help you with your task.',
    toolCalls: [
      {
        id: 'call_123',
        type: 'function',
        function: {
          name: 'search_web',
          arguments: '{"query": "example search"}'
        }
      }
    ]
  } as any,
  { role: 'tool', content: 'Search results for example search', toolCallId: 'call_123' },
  { role: 'user', content: 'Thanks!' }
];

describe('MessageProcessor', () => {
  describe('sanitizeMessages', () => {
    test('should sanitize user and assistant messages correctly', () => {
      const sanitized = MessageProcessor.sanitizeMessages(mockMessages);
      
      expect(sanitized.length).toBe(mockMessages.length);
      expect(sanitized[0].role).toBe('system');
      expect(sanitized[1].role).toBe('user');
      expect(sanitized[2].role).toBe('assistant');
      expect(sanitized[2].content).toBe('I am doing well, thank you for asking!');
    });

    test('should properly handle tool calls in assistant messages', () => {
      const sanitized = MessageProcessor.sanitizeMessages(mockMessagesWithToolCalls);
      
      // 検証：ツール呼び出しを含むアシスタントメッセージ
      const assistantWithToolCalls = sanitized.find(
        m => m.role === 'assistant' && (m as any).toolCalls
      );
      
      expect(assistantWithToolCalls).toBeDefined();
      expect((assistantWithToolCalls as any).toolCalls).toHaveLength(1);
      expect((assistantWithToolCalls as any).toolCalls[0].function.name).toBe('search_web');
    });

    test('should properly handle tool result messages', () => {
      const sanitized = MessageProcessor.sanitizeMessages(mockMessagesWithToolCalls);
      
      // 検証：ツール結果メッセージ
      const toolResultMessage = sanitized.find(m => m.role === 'tool');
      
      expect(toolResultMessage).toBeDefined();
      expect(toolResultMessage!.toolCallId).toBe('call_123');
      expect(toolResultMessage!.content).toBe('Search results for example search');
    });
  });

  describe('convertToOpenAIFormat', () => {
    test('should convert messages to OpenAI format correctly', () => {
      const preprocessed = MessageProcessor.sanitizeMessages(mockMessages);
      const converted = MessageProcessor.convertToOpenAIFormat(mockMessages, preprocessed);
      
      expect(converted.length).toBe(mockMessages.length);
      expect(converted[0].role).toBe('system');
      expect(converted[0].content).toContain('You are a helpful assistant');
      // ステップバイステップの指示が追加されていることを確認
      expect(converted[0].content).toContain('ステップバイステップで考えて');
    });

    test('should handle tool calls in OpenAI format correctly', () => {
      const preprocessed = MessageProcessor.sanitizeMessages(mockMessagesWithToolCalls);
      const converted = MessageProcessor.convertToOpenAIFormat(mockMessagesWithToolCalls, preprocessed);
      
      // ツール呼び出しを含むアシスタントメッセージを検索
      const assistantWithToolCalls = converted.find(
        m => m.role === 'assistant' && m.tool_calls
      );
      
      expect(assistantWithToolCalls).toBeDefined();
      expect(assistantWithToolCalls.tool_calls).toHaveLength(1);
      expect(assistantWithToolCalls.tool_calls[0].function.name).toBe('search_web');
      expect(assistantWithToolCalls.tool_calls[0].function.arguments).toBe('{"query":"example search"}');
    });

    test('should handle tool result messages in OpenAI format correctly', () => {
      const preprocessed = MessageProcessor.sanitizeMessages(mockMessagesWithToolCalls);
      const converted = MessageProcessor.convertToOpenAIFormat(mockMessagesWithToolCalls, preprocessed);
      
      // ツール結果メッセージを検索
      const toolResultMessage = converted.find(m => m.role === 'tool');
      
      expect(toolResultMessage).toBeDefined();
      expect(toolResultMessage.tool_call_id).toBe('call_123');
      expect(toolResultMessage.content).toBe('Search results for example search');
    });
  });

  describe('messageHasToolCalls', () => {
    test('should return true for messages with tool calls', () => {
      const messageWithToolCalls = {
        role: 'assistant',
        content: 'I can help you with that.',
        toolCalls: [
          {
            id: 'call_123',
            type: 'function',
            function: {
              name: 'search_web',
              arguments: '{"query": "test"}'
            }
          }
        ]
      } as any;
      
      expect(MessageProcessor.messageHasToolCalls(messageWithToolCalls)).toBe(true);
    });

    test('should return false for messages without tool calls', () => {
      const messageWithoutToolCalls = {
        role: 'assistant',
        content: 'I can help you with that.'
      };
      
      expect(MessageProcessor.messageHasToolCalls(messageWithoutToolCalls)).toBe(false);
    });

    test('should return false for non-assistant messages', () => {
      const userMessage = {
        role: 'user',
        content: 'Can you help me?'
      };
      
      expect(MessageProcessor.messageHasToolCalls(userMessage)).toBe(false);
    });
  });

  describe('messageIsEmpty', () => {
    test('should return true for empty string content', () => {
      const emptyMessage = { role: 'user', content: '' };
      expect(MessageProcessor.messageIsEmpty(emptyMessage)).toBe(true);
    });

    test('should return true for whitespace-only content', () => {
      const whitespaceMessage = { role: 'user', content: '   ' };
      expect(MessageProcessor.messageIsEmpty(whitespaceMessage)).toBe(true);
    });

    test('should return false for non-empty content', () => {
      const nonEmptyMessage = { role: 'user', content: 'Hello' };
      expect(MessageProcessor.messageIsEmpty(nonEmptyMessage)).toBe(false);
    });

    test('should handle array content correctly', () => {
      const emptyArrayContent = { 
        role: 'user', 
        content: [{ type: 'text', text: '' }] 
      } as any;
      
      expect(MessageProcessor.messageIsEmpty(emptyArrayContent)).toBe(true);
      
      const nonEmptyArrayContent = { 
        role: 'user', 
        content: [{ type: 'text', text: 'Hello' }] 
      } as any;
      
      expect(MessageProcessor.messageIsEmpty(nonEmptyArrayContent)).toBe(false);
    });
  });

  describe('addSpaceToEmptyMessages', () => {
    test('should add space to empty messages', () => {
      const messages = [
        { role: 'user', content: '' },
        { role: 'assistant', content: 'Hello' },
        { role: 'user', content: '   ' }
      ];
      
      const result = MessageProcessor.addSpaceToEmptyMessages(messages);
      
      expect(result[0].content).toBe(' ');
      expect(result[1].content).toBe('Hello');
      expect(result[2].content).toBe(' ');
    });

    test('should not modify non-empty messages', () => {
      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' }
      ];
      
      const result = MessageProcessor.addSpaceToEmptyMessages(messages);
      
      expect(result[0].content).toBe('Hello');
      expect(result[1].content).toBe('Hi there');
    });
  });
});
