import {
  safeStringify,
  isValidJson,
  extractValidJson,
  safeJsonParse,
  processJsonDelta,
  processToolArgumentsDelta,
  repairDuplicatedJsonPattern
} from '../../utils/json';

// safeStringify のテスト
describe('safeStringify', () => {
  test('should stringify regular objects', () => {
    const obj = { name: 'test', age: 30 };
    expect(safeStringify(obj)).toBe('{"name":"test","age":30}');
  });

  test('should return the string if input is already a string', () => {
    const str = 'already a string';
    expect(safeStringify(str)).toBe(str);
  });

  test('should return default value for null', () => {
    expect(safeStringify(null, 'default')).toBe('default');
  });

  test('should return default value for undefined', () => {
    expect(safeStringify(undefined, 'default')).toBe('default');
  });
});

// isValidJson のテスト
describe('isValidJson', () => {
  test('should return true for valid JSON objects', () => {
    expect(isValidJson('{"name":"test"}')).toBe(true);
  });

  test('should return true for valid JSON arrays', () => {
    expect(isValidJson('[1,2,3]')).toBe(true);
  });

  test('should return false for invalid JSON', () => {
    expect(isValidJson('{"name":"test"')).toBe(false);
  });

  test('should return false for empty strings', () => {
    expect(isValidJson('')).toBe(false);
  });

  test('should return false for non-string inputs', () => {
    expect(isValidJson(null as any)).toBe(false);
    expect(isValidJson(undefined as any)).toBe(false);
    expect(isValidJson(123 as any)).toBe(false);
  });
});

// extractValidJson のテスト
describe('extractValidJson', () => {
  test('should extract valid JSON object from text', () => {
    const text = 'Some prefix {"name":"test"} some suffix';
    expect(extractValidJson(text)).toBe('{"name":"test"}');
  });

  test('should extract valid JSON array from text', () => {
    const text = 'Some prefix [1,2,3] some suffix';
    expect(extractValidJson(text)).toBe('[1,2,3]');
  });

  test('should return null for invalid JSON', () => {
    expect(extractValidJson('{"name":"test"')).toBe(null);
  });

  test('should return null for non-string inputs', () => {
    expect(extractValidJson(null as any)).toBe(null);
    expect(extractValidJson(undefined as any)).toBe(null);
  });
});

// safeJsonParse のテスト
describe('safeJsonParse', () => {
  test('should parse valid JSON string', () => {
    const json = '{"name":"test","age":30}';
    expect(safeJsonParse(json, null)).toEqual({ name: 'test', age: 30 });
  });

  test('should return default value for invalid JSON', () => {
    const defaultValue = { default: true };
    expect(safeJsonParse('{"name":"test"', defaultValue)).toBe(defaultValue);
  });

  test('should return default value for non-string inputs', () => {
    const defaultValue = { default: true };
    expect(safeJsonParse(null as any, defaultValue)).toBe(defaultValue);
    expect(safeJsonParse(undefined as any, defaultValue)).toBe(defaultValue);
  });

  test('should try to extract valid JSON from mixed content', () => {
    const mixedContent = 'Some prefix {"name":"test"} some suffix';
    expect(safeJsonParse(mixedContent, null)).toEqual({ name: 'test' });
  });
});

// processJsonDelta のテスト
describe('processJsonDelta', () => {
  test('should combine JSON fragments correctly', () => {
    const current = '{"name":';
    const delta = '"test"}';
    const result = processJsonDelta(current, delta);
    
    expect(result.combined).toBe('{"name":"test"}');
    expect(result.valid).toBe(true);
    expect(result.complete).toBe(true);
  });

  test('should handle incomplete JSON correctly', () => {
    const current = '{"name":';
    const delta = '"test",';
    const result = processJsonDelta(current, delta);
    
    expect(result.combined).toBe('{"name":"test",');
    expect(result.valid).toBe(false);
    expect(result.complete).toBe(false);
  });

  test('should handle array fragments', () => {
    const current = '[1,2,';
    const delta = '3]';
    const result = processJsonDelta(current, delta);
    
    expect(result.combined).toBe('[1,2,3]');
    expect(result.valid).toBe(true);
    expect(result.complete).toBe(true);
  });
});

// processToolArgumentsDelta のテスト
describe('processToolArgumentsDelta', () => {
  test('should process tool argument fragments correctly', () => {
    const current = '{"query":';
    const delta = '"test"}';
    const result = processToolArgumentsDelta(current, delta);
    
    expect(result.processedArgs).toBe('{"query":"test"}');
    expect(result.isComplete).toBe(true);
  });

  test('should handle empty fragments', () => {
    const current = '{"query":"test"}';
    const delta = '';
    const result = processToolArgumentsDelta(current, delta);
    
    expect(result.processedArgs).toBe('{"query":"test"}');
    expect(result.isComplete).toBe(true);
  });

  test('should handle incomplete JSON fragments', () => {
    const current = '{"query":';
    const delta = '"test",';
    const result = processToolArgumentsDelta(current, delta);
    
    expect(result.processedArgs).toBe('{"query":"test",');
    expect(result.isComplete).toBe(false);
  });
});

// repairDuplicatedJsonPattern のテスト
describe('repairDuplicatedJsonPattern', () => {
  test('should repair duplicated JSON pattern', () => {
    const duplicated = '{"filepath": "app.py"}{"filepath": "app.py"}';
    expect(repairDuplicatedJsonPattern(duplicated)).toBe('{"filepath": "app.py"}');
  });

  test('should handle already valid JSON', () => {
    const valid = '{"filepath": "app.py"}';
    expect(repairDuplicatedJsonPattern(valid)).toBe(valid);
  });

  test('should handle null and undefined', () => {
    expect(repairDuplicatedJsonPattern(null as any)).toBe(null);
    expect(repairDuplicatedJsonPattern(undefined as any)).toBe(undefined);
  });

  test('should handle non-string inputs', () => {
    const obj = { test: true };
    expect(repairDuplicatedJsonPattern(obj as any)).toBe(obj);
  });
});
