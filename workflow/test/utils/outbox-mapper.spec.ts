import { describe, expect, it } from "vitest";
import { outboxMapper } from '../../src/utils/outbox-mapper'
import { OUTBOX_TYPE } from "../../src/types/types";

describe('outboxMapper', () => {

  it('should return the correct mapper for "index" type', () => {
    const mapper = outboxMapper('index');
    expect(mapper).toHaveProperty('serialize');
    expect(mapper).toHaveProperty('deserialize');
  });

  it('should throw an error for invalid type', () => {
    expect(() => outboxMapper('invalid' as OUTBOX_TYPE)).toThrow('Invalid type');
  });
});

describe('indexSerializer', () => {

  it('should serialize IndexProperties correctly', () => {
    const indexProps = {
      owner: 'user1',
      name: 'repo1',
      path: '/',
      key: 'HEAD:'
    };

    const mapper = outboxMapper('index');
    const serialized = mapper.serialize(indexProps);
    expect(serialized).toBe('user1~repo1~/~HEAD:');
  });

  it('should handle empty path', () => {
    const indexProps = {
      owner: 'user1',
      name: 'repo1',
      path: '',
      key: 'README.md'
    };
    const mapper = outboxMapper('index');
    const serialized = mapper.serialize(indexProps);
    expect(serialized).toBe('user1~repo1~~README.md');
  });
});

describe('indexDeserializer', () => {
  it('should deserialize correctly', () => {
    const serialized = 'user1~repo1~/~HEAD:';
    const mapper = outboxMapper('index');
    const deserialized = mapper.deserialize(serialized);

    expect(deserialized).toEqual({
      owner: 'user1',
      name: 'repo1',
      path: '/',
      key: 'HEAD:'
    });
  });

  it('should handle empty path', () => {
    const serialized = 'user1~repo1~README.md';
    const mapper = outboxMapper('index');

    const deserialized = mapper.deserialize(serialized);

    expect(deserialized).toEqual({
      owner: 'user1',
      name: 'repo1',
      path: '',
      key: 'README.md'
    });
  });

  it('should throw an error for invalid format', () => {
    const serialized = 'user1~repo1';
    const mapper = outboxMapper('index');
    expect(() => mapper.deserialize(serialized)).toThrow('Missing key in index outbox deserialization');
  });
});
