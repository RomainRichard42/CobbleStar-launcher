import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

export type LauncherSettings = {
  memoryMb: number
}

const DEFAULT_SETTINGS: LauncherSettings = {
  memoryMb: 4096,
}

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json')
}

function normalizeMemory(value: unknown) {
  const numericValue = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numericValue)) return DEFAULT_SETTINGS.memoryMb
  return Math.min(12288, Math.max(2048, Math.round(numericValue / 1024) * 1024))
}

export function getSettings(): LauncherSettings {
  try {
    const stored = JSON.parse(fs.readFileSync(settingsPath(), 'utf8')) as Partial<LauncherSettings>
    return { memoryMb: normalizeMemory(stored.memoryMb) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(input: Partial<LauncherSettings>): LauncherSettings {
  const settings = { memoryMb: normalizeMemory(input.memoryMb) }
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true })
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), 'utf8')
  return settings
}
