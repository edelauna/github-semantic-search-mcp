import { env, createExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";

describe("test", () => {
  it('test', () => {
    const ctx = createExecutionContext()
    expect(2).toBe(2)
  })
})

