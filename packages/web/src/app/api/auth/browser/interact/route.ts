import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  clickAt, clickText, typeText, pressKey, scrollPage, focusInput,
  dispatchMouseEvent, dispatchKeyEvent,
} from "@/lib/browser-auth";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session.deviceId) {
      return NextResponse.json({ error: "No browser session" }, { status: 400 });
    }

    const body = await req.json();
    const { action, x, y, text, key, code, eventType, button, clickCount } = body;

    switch (action) {
      // Legacy Puppeteer-based actions
      case "click":
        if (typeof x !== "number" || typeof y !== "number") {
          return NextResponse.json({ error: "x and y required for click" }, { status: 400 });
        }
        await clickAt(session.deviceId, x, y);
        break;
      case "clickText": {
        if (typeof text !== "string") {
          return NextResponse.json({ error: "text required for clickText" }, { status: 400 });
        }
        const clicked = await clickText(session.deviceId, text);
        return NextResponse.json({ ok: true, clicked });
      }
      case "type":
        if (typeof text !== "string") {
          return NextResponse.json({ error: "text required for type" }, { status: 400 });
        }
        await typeText(session.deviceId, text);
        break;
      case "key":
        if (typeof key !== "string") {
          return NextResponse.json({ error: "key required for key press" }, { status: 400 });
        }
        await pressKey(session.deviceId, key);
        break;
      case "focus": {
        const focused = await focusInput(session.deviceId, text);
        return NextResponse.json({ ok: true, focused });
      }
      case "scroll":
        await scrollPage(session.deviceId, text === "up" ? "up" : "down");
        break;

      // CDP-based input dispatch (low latency)
      case "mouse":
        if (typeof x !== "number" || typeof y !== "number" || typeof eventType !== "string") {
          return NextResponse.json({ error: "x, y, eventType required for mouse" }, { status: 400 });
        }
        await dispatchMouseEvent(session.deviceId, eventType, x, y, button, clickCount);
        break;
      case "keyboard":
        if (typeof eventType !== "string" || typeof key !== "string") {
          return NextResponse.json({ error: "eventType, key required for keyboard" }, { status: 400 });
        }
        await dispatchKeyEvent(session.deviceId, eventType, key, code, text);
        break;

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Interaction failed" },
      { status: 500 }
    );
  }
}
