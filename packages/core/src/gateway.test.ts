import { describe, it, expect, vi } from "vitest";
import { CoreGateway, loadGatewayConfig } from "./gateway.js";
import { createTraceContext } from "./bus.js";

describe("Gateway Integration", () => {
  it("should start, publish ping, and propagate trace context", async () => {
    const gateway = new CoreGateway();
    const config = await loadGatewayConfig("aegis.config.yaml");

    await gateway.start(config);

    const handler = vi.fn();
    const sub = gateway.bus.subscribe({ topics: ["system.health"] }, handler);

    const traceCtx = createTraceContext();
    const event = {
      id: "evt-1" as any,
      topic: "system.health" as const,
      payload: { status: "ok" },
      traceCtx,
      timestamp: new Date().toISOString()
    };

    await gateway.bus.publish(event);

    expect(handler).toHaveBeenCalledWith(event);
    const callArgs = handler.mock.calls[0][0];
    expect(callArgs.traceCtx.traceId).toBe(traceCtx.traceId);

    sub.unsubscribe();
    await gateway.stop();
  });
});
