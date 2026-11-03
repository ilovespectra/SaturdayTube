import Cocoa
import ApplicationServices

let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
guard AXIsProcessTrustedWithOptions(options) else {
    fputs("Desktop trackpad requires Accessibility permission in System Settings > Privacy & Security > Accessibility.\n", stderr)
    exit(1)
}
var down = false
var lastClick = Date.distantPast
var clicks: Int64 = 1
func mouse(_ type: CGEventType, _ point: CGPoint) {
    let event = CGEvent(mouseEventSource: nil, mouseType: type, mouseCursorPosition: point, mouseButton: .left)
    event?.setIntegerValueField(.mouseEventClickState, value: clicks)
    event?.post(tap: .cghidEventTap)
}
defer {
    if down { mouse(.leftMouseUp, CGEvent(source: nil)!.location) }
}
while let line = readLine() {
    guard let data = line.data(using: .utf8),
          let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let type = value["type"] as? String,
          let location = CGEvent(source: nil)?.location else { continue }
    let dx = (value["dx"] as? Double) ?? 0
    let dy = (value["dy"] as? Double) ?? 0
    switch type {
    case "move":
        let target = CGPoint(x: location.x + dx, y: location.y + dy)
        mouse(down ? .leftMouseDragged : .mouseMoved, target)
    case "down":
        clicks = Date().timeIntervalSince(lastClick) < NSEvent.doubleClickInterval ? 2 : 1
        down = true
        mouse(.leftMouseDown, location)
    case "up":
        if down { mouse(.leftMouseUp, location); lastClick = Date() }
        down = false
    case "click":
        clicks = Date().timeIntervalSince(lastClick) < NSEvent.doubleClickInterval ? 2 : 1
        mouse(.leftMouseDown, location)
        mouse(.leftMouseUp, location)
        lastClick = Date()
    case "scroll":
        CGEvent(scrollWheelEvent2Source: nil, units: .pixel, wheelCount: 2,
                wheel1: Int32(dy), wheel2: Int32(dx), wheel3: 0)?.post(tap: .cghidEventTap)
    default: break
    }
}
