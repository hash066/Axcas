import { describe, expect, it } from "vitest";
import path from "node:path";

import { initialReelPlan, reelDurationSeconds, validateRenderInputs } from "../../apps/reel-worker/src/render";

describe("reel renderer", () => {
  it("pins the approved vertical-video format and exact scene duration", () => {
    const assetRoot = path.resolve("fixtures", "reel-assets");
    const assets = {
      "cake-1": path.join(assetRoot, "cake-1.jpg"),
      "cake-2": path.join(assetRoot, "cake-2.jpg"),
      "cake-3": path.join(assetRoot, "cake-3.jpg"),
    };
    expect(reelDurationSeconds(initialReelPlan)).toBe(15);
    expect(validateRenderInputs(initialReelPlan, assets, assetRoot)).toEqual(Object.values(assets));
  });

  it("rejects unapproved assets and path traversal", () => {
    const assetRoot = path.resolve("fixtures", "reel-assets");
    expect(() => validateRenderInputs(initialReelPlan, { "cake-1": path.resolve(assetRoot, "..", "secret.jpg") }, assetRoot)).toThrow();
  });
});
