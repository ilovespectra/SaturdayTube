const fs = require('node:fs');
const path = require('node:path');

function isValidRect(rect) {
  return rect && Number.isFinite(rect.x) && Number.isFinite(rect.y)
    && Number.isFinite(rect.width) && Number.isFinite(rect.height)
    && rect.width > 0 && rect.height > 0;
}

function overlapArea(rect, area) {
  if (!isValidRect(rect) || !isValidRect(area)) return 0;
  const width = Math.max(0, Math.min(rect.x + rect.width, area.x + area.width) - Math.max(rect.x, area.x));
  const height = Math.max(0, Math.min(rect.y + rect.height, area.y + area.height) - Math.max(rect.y, area.y));
  return width * height;
}

function restoreWindowBounds(saved, {
  displays = [],
  primaryDisplay = displays[0],
  defaultBounds = { width: 1280, height: 820 },
  minWidth = 900,
  minHeight = 640
} = {}) {
  const usableDisplays = displays.filter(display => isValidRect(display?.workArea));
  const primary = usableDisplays.find(display => display.id === primaryDisplay?.id)
    || (usableDisplays.includes(primaryDisplay) ? primaryDisplay : usableDisplays[0]);
  if (!primary) {
    return { x: 0, y: 0, width: defaultBounds.width, height: defaultBounds.height };
  }

  const savedIsValid = isValidRect(saved);
  const displayWithWindow = savedIsValid
    ? usableDisplays.find(display => overlapArea(saved, display.workArea) > 0)
    : null;
  const display = displayWithWindow || primary;
  const area = display.workArea;
  const source = savedIsValid ? saved : defaultBounds;
  const width = Math.min(area.width, Math.max(Math.min(minWidth, area.width), Math.round(source.width)));
  const height = Math.min(area.height, Math.max(Math.min(minHeight, area.height), Math.round(source.height)));
  const requestedX = displayWithWindow ? Math.round(saved.x) : Math.round(area.x + (area.width - width) / 2);
  const requestedY = displayWithWindow ? Math.round(saved.y) : Math.round(area.y + (area.height - height) / 2);

  return {
    x: Math.max(area.x, Math.min(requestedX, area.x + area.width - width)),
    y: Math.max(area.y, Math.min(requestedY, area.y + area.height - height)),
    width,
    height
  };
}

function readWindowBounds(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return isValidRect(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeWindowBounds(filePath, bounds) {
  if (!isValidRect(bounds)) return false;
  const stored = {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.round(bounds.width),
    height: Math.round(bounds.height)
  };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(stored)}\n`);
  fs.renameSync(temporaryPath, filePath);
  return true;
}

module.exports = { readWindowBounds, restoreWindowBounds, writeWindowBounds };
