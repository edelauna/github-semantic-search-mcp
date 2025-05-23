import { describe, expect, it } from "vitest";
import { makeDocuments } from '../../src/services/document.service'

describe('makeDocuments', () => {
  it('should return an empty array for an empty message', () => {
    const result = makeDocuments("");
    expect(result).toEqual([]);
  });

  it('should create a single document for a short message', () => {
    const message = "This is a short line.\nAnother short line.";
    const result = makeDocuments(message);
    expect(result.length).toBe(1);
    expect(result[0].text).toBe("This is a short line.\nAnother short line.\n");
    expect(result[0].lineRange).toEqual([1, 2]);
    expect(result[0].tokenCount).toBeGreaterThan(0);
  });

  it('should split into multiple documents based on token limit', () => {
    const longLine = "word ".repeat(499) + "\n"; // Will likely exceed token limit
    const message = longLine + "short line\n";
    const result = makeDocuments(message);
    expect(result.length).toBeGreaterThan(1);
    expect(result[0].tokenCount).toBeLessThanOrEqual(500);
    expect(result[1].text).toBe("short line\n\n");
    expect(result[1].lineRange).toEqual([2, 3]);
    expect(result[1].tokenCount).toBe(3);
  });

  it('should handle lines that individually exceed the token limit by skipping them', () => {
    const veryLongLine = "word ".repeat(600) + "\n";
    const message = "normal line\n" + veryLongLine + "another normal line\n";
    const result = makeDocuments(message);

    expect(result.length).toBe(2);
    expect(result[0].text).toBe("normal line\n");
    expect(result[0].lineRange).toEqual([1, 1]);
    expect(result[0].tokenCount).toBeGreaterThan(0);
    expect(result[1].text).toBe("another normal line\n\n");
    expect(result[1].lineRange).toEqual([3, 4]);
    expect(result[1].tokenCount).toBeGreaterThan(0);
  });

  it('should handle multiple short lines that fill up a document', () => {
    const shortLines = Array.from({ length: 10 }, (_, i) => `Line ${i + 1}\n`).join('');
    const result = makeDocuments(shortLines);
    expect(result.length).toBe(1); // Might be more depending on token count per line
    expect(result[0].text).toBe(shortLines + '\n');
    expect(result[0].lineRange).toEqual([1, 11]);
    expect(result[0].tokenCount).toBeLessThanOrEqual(500);
    const longerShortLines = Array.from({ length: 500 }, (_, i) => `This is a slightly longer line ${i + 1}.\n`).join('');
    const resultMultipleDocs = makeDocuments(longerShortLines);
    expect(resultMultipleDocs.length).toBeGreaterThan(1);
    resultMultipleDocs.forEach(doc => {
      expect(doc.tokenCount).toBeLessThanOrEqual(500);
    });
  });

  it('should handle a message with only a single line', () => {
    const message = "Just one line.";
    const result = makeDocuments(message);
    expect(result.length).toBe(1);
    expect(result[0].text).toBe("Just one line.\n");
    expect(result[0].lineRange).toEqual([1, 1]);
    expect(result[0].tokenCount).toBeGreaterThan(0);
  });
});
