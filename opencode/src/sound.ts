// The crew's jingle, the very file Claude Crew plays. OpenCode's own sounds
// are a short list of names, so the plugin plays its file with the system's
// player, as Claude Crew does: PowerShell's SoundPlayer on Windows, afplay,
// paplay or aplay elsewhere. A missing player means a silent cheer.
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/** Plays one of the plugin's sounds without waiting for it to end. */
export function playSound(name: 'mission-complete'): void {
  // The repository's sounds folder, shared with Claude Crew.
  const path = fileURLToPath(new URL(`../../sounds/${name}.wav`, import.meta.url))
  try {
    const child =
      process.platform === 'win32'
        ? spawn(
            'powershell',
            ['-NoProfile', '-NonInteractive', '-Command', `(New-Object System.Media.SoundPlayer '${path.replace(/'/g, "''")}').PlaySync()`],
            { stdio: 'ignore', windowsHide: true },
          )
        : spawn(
            'sh',
            [
              '-c',
              'if command -v afplay >/dev/null 2>&1; then afplay "$1"; elif command -v paplay >/dev/null 2>&1; then paplay "$1"; elif command -v aplay >/dev/null 2>&1; then aplay -q "$1"; fi',
              'sh',
              path,
            ],
            { stdio: 'ignore' },
          )
    child.on('error', () => {})
    child.unref()
  } catch {
    // The crew cheers silently.
  }
}
