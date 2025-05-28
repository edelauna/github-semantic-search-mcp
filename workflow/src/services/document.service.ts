import { encode } from 'gpt-tokenizer';
import { log } from '../utils/logging.utils';

export type TokenizedDocument = {
  text: string,
  lineRange: [number, number]
  tokenCount: number
}

export const DOCUMENTS_MAX_TOKENS = 500; // max input is 512, but gpt-tokenizer is not for bpe model, hopefully no overflow

const countTokens = (message: string): number => {
  return message.trim() === "" ? 0 : encode(message).length;
}

export const makeDocuments = (message: string): TokenizedDocument[] => {
  const docs: TokenizedDocument[] = [];
  if (message.trim() === "") return docs;

  let tokenCount = 0;
  let currentLength = 0;
  const lines = message.split("\n");
  let lineNumber = 1;
  let documentBuilder = '';
  let startLineNumber = lineNumber;

  for (const line of lines) {
    const lineWithNewLine = `${line}\n`;
    const currentTokens = countTokens(lineWithNewLine);

    const wouldExceedTokens = (tokenCount + currentTokens) > DOCUMENTS_MAX_TOKENS;

    if (wouldExceedTokens) {
      if (documentBuilder) {
        docs.push({ text: documentBuilder, lineRange: [startLineNumber, lineNumber - 1], tokenCount });
      }
      documentBuilder = '';
      tokenCount = 0;
      currentLength = 0;
      startLineNumber = lineNumber;
    }

    if (currentTokens > DOCUMENTS_MAX_TOKENS) {
      log.warn('makeDocuments', `Document:line ${lineNumber} exceeds limits ` +
        `(tokens: ${currentTokens}/${DOCUMENTS_MAX_TOKENS}), skipping`
      );
      if (startLineNumber == lineNumber) {
        startLineNumber++
      }
    } else {
      tokenCount += currentTokens;
      documentBuilder += lineWithNewLine;
    }

    lineNumber++;
  }

  if (documentBuilder) {
    docs.push({ text: documentBuilder, lineRange: [startLineNumber, lineNumber - 1], tokenCount });
  }

  return docs;
}
