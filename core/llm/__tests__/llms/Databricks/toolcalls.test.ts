import { ToolCallProcessor } from '../../../llms/Databricks/toolcalls';
import { ChatMessage } from '../../../../index';

describe('ToolCallProcessor', () => {
  describe('preprocessToolCallsAndResults', () => {
    test('should add dummy tool results for tool calls without results', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hello' },
        {
          role: 'assistant',
          content: 'I can help with that.',
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
        } as any,
        { role: 'user', content: 'Thanks!' }
      ];
      
      const processed = ToolCallProcessor.preprocessToolCallsAndResults(messages);
      
      // 期待：ユーザーメッセージの前にダミーのツール結果が追加されている
      expect(processed.length).toBe(messages.length);
      
      // 3番目のメッセージ（Thanks!）がダミーのツール結果を含むように更新されていることを確認
      const content = processed[2].content as string;
      expect(content).toContain('tool_call_id');
      expect(content).toContain('call_123');
      expect(content).toContain('Tool execution pending');
    });

    test('should not modify messages with existing tool results', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hello' },
        {
          role: 'assistant',
          content: 'I can help with that.',
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
        } as any,
        { role: 'tool', content: 'Search results', toolCallId: 'call_123' },
        { role: 'user', content: 'Thanks!' }
      ];
      
      const processed = ToolCallProcessor.preprocessToolCallsAndResults(messages);
      
      // メッセージ数が同じままであることを確認
      expect(processed.length).toBe(messages.length);
      
      // ツール結果メッセージが変更されていないことを確認
      expect(processed[2].role).toBe('tool');
      expect(processed[2].content).toBe('Search results');
      expect(processed[2].toolCallId).toBe('call_123');
    });

    test('should add tool results to the beginning of assistant messages', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hello' },
        {
          role: 'assistant',
          content: 'I can help with that.',
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
        } as any,
        { role: 'assistant', content: 'Here is the information.' },
        { role: 'user', content: 'Thanks!' }
      ];
      
      const processed = ToolCallProcessor.preprocessToolCallsAndResults(messages);
      
      // アシスタントメッセージがツール結果を含むように更新されていることを確認
      const assistantMessage = processed[2];
      expect(assistantMessage.role).toBe('assistant');
      expect((assistantMessage.content as string).startsWith('{"role":"tool"')).toBe(true);
      expect((assistantMessage.content as string).includes('Here is the information.')).toBe(true);
    });
  });

  describe('createDummyToolResults', () => {
    test('should create dummy tool results for tool calls', () => {
      const toolCalls = [
        {
          id: 'call_123',
          type: 'function',
          function: {
            name: 'search_web',
            arguments: '{"query": "test"}'
          }
        },
        {
          id: 'call_456',
          type: 'function',
          function: {
            name: 'get_weather',
            arguments: '{"location": "Tokyo"}'
          }
        }
      ];
      
      const dummyResults = ToolCallProcessor.createDummyToolResults(toolCalls);
      
      expect(dummyResults).toHaveLength(2);
      expect(dummyResults[0].role).toBe('tool');
      expect(dummyResults[0].tool_call_id).toBe('call_123');
      expect(dummyResults[0].content).toContain('pending');
      
      expect(dummyResults[1].role).toBe('tool');
      expect(dummyResults[1].tool_call_id).toBe('call_456');
      expect(dummyResults[1].content).toContain('pending');
    });
  });

  describe('repairToolArguments', () => {
    test('should repair duplicated JSON patterns', () => {
      const duplicated = '{"filepath": "app.py"}{"filepath": "app.py"}';
      const repaired = ToolCallProcessor.repairToolArguments(duplicated);
      
      expect(repaired).toBe('{"filepath": "app.py"}');
    });

    test('should handle special filepath patterns', () => {
      const malformed = '{"filepath": "app.py"{"filepath": "app.py"';
      const repaired = ToolCallProcessor.repairToolArguments(malformed);
      
      expect(repaired).toBe('{"filepath": "app.py"}');
    });

    test('should handle special query patterns', () => {
      const malformed = '{"query": "test"{"query": "test"';
      const repaired = ToolCallProcessor.repairToolArguments(malformed);
      
      expect(repaired).toBe('{"query": "test"}');
    });

    test('should return empty object for empty input', () => {
      expect(ToolCallProcessor.repairToolArguments('')).toBe('{}');
      expect(ToolCallProcessor.repairToolArguments('   ')).toBe('{}');
    });
  });

  describe('processToolArgumentsDelta', () => {
    test('should process complete JSON tool arguments', () => {
      const result = ToolCallProcessor.processToolArgumentsDelta(
        'search_web',
        '{"query":',
        '"test"}'
      );
      
      expect(result.processedArgs).toBe('{"query":"test"}');
      expect(result.isComplete).toBe(true);
    });

    test('should add default query for search tools with empty args', () => {
      const result = ToolCallProcessor.processToolArgumentsDelta(
        'search_web',
        '{}',
        ''
      );
      
      expect(result.processedArgs).toBe('{"query":""}');
      expect(result.isComplete).toBe(true);
    });

    test('should handle incomplete JSON arguments', () => {
      const result = ToolCallProcessor.processToolArgumentsDelta(
        'get_weather',
        '{"location":',
        '"Tokyo",'
      );
      
      expect(result.processedArgs).toBe('{"location":"Tokyo",');
      expect(result.isComplete).toBe(false);
    });
  });

  describe('isSearchTool', () => {
    test('should return true for search tools', () => {
      expect(ToolCallProcessor.isSearchTool('search_web')).toBe(true);
      expect(ToolCallProcessor.isSearchTool('web_search')).toBe(true);
      expect(ToolCallProcessor.isSearchTool('search_documents')).toBe(true);
    });

    test('should return false for non-search tools', () => {
      expect(ToolCallProcessor.isSearchTool('get_weather')).toBe(false);
      expect(ToolCallProcessor.isSearchTool('create_file')).toBe(false);
      expect(ToolCallProcessor.isSearchTool('calculate')).toBe(false);
    });

    test('should handle undefined and empty strings', () => {
      expect(ToolCallProcessor.isSearchTool(undefined)).toBe(false);
      expect(ToolCallProcessor.isSearchTool('')).toBe(false);
    });
  });
});
