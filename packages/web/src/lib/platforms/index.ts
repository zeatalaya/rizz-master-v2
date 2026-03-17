/**
 * Platform adapter factory.
 * Routes to correct adapter based on platform string.
 */

import type { Platform } from "@rizz/shared";
import type { PlatformAdapter, PlatformAuthAdapter } from "./types";

export function getAdapter(platform: Platform): PlatformAdapter {
  switch (platform) {
    case "tinder": {
      const { tinderAdapter } = require("./tinder/api");
      return tinderAdapter;
    }
    case "bumble": {
      const { bumbleAdapter } = require("./bumble/api");
      return bumbleAdapter;
    }
    case "hinge": {
      const { hingeAdapter } = require("./hinge/api");
      return hingeAdapter;
    }
    default:
      throw new Error(`Unknown platform: ${platform}`);
  }
}

export function getAuthAdapter(platform: Platform): PlatformAuthAdapter {
  switch (platform) {
    case "tinder": {
      const { tinderAuthAdapter } = require("./tinder/auth");
      return tinderAuthAdapter;
    }
    case "bumble": {
      const { bumbleAuthAdapter } = require("./bumble/auth");
      return bumbleAuthAdapter;
    }
    case "hinge": {
      const { hingeAuthAdapter } = require("./hinge/auth");
      return hingeAuthAdapter;
    }
    default:
      throw new Error(`Unknown platform: ${platform}`);
  }
}

export function generateDeviceIds(platform: Platform) {
  switch (platform) {
    case "tinder": {
      const { generateDeviceIds } = require("./tinder/auth");
      return generateDeviceIds();
    }
    case "hinge": {
      const { generateHingeDeviceIds } = require("./hinge/auth");
      return generateHingeDeviceIds();
    }
    default: {
      // Bumble doesn't need device IDs but we generate placeholder ones
      const { randomUUID } = require("crypto");
      return {
        deviceId: randomUUID().replace(/-/g, "").slice(0, 16),
        appSessionId: randomUUID(),
        installId: randomUUID(),
        funnelSessionId: randomUUID(),
      };
    }
  }
}

export type { PlatformAdapter, PlatformAuthAdapter } from "./types";
