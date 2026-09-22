import { describe, expect, it } from 'vitest'
import { runNativeCommand, runNativeVisibleCommand } from '@deepseek-ai/dsh-native-command'

const node = process.execPath

describe('runNativeCommand', () => {
  it('captures utf8 stdout and stderr on exit 0', async () => {
    const result = await runNativeCommand(
      node,
      ['-e', 'process.stdout.write("out✓"); process.stderr.write("err")'],
      new AbortController().signal,
    )
    expect(result).toEqual({ stdout: 'out✓', stderr: 'err' })
  })

  it('rejects a non-zero exit with code, stdout, and stderr attached', async () => {
    const failure = await runNativeCommand(
      node,
      ['-e', 'process.stdout.write("partial"); process.stderr.write("boom"); process.exit(3)'],
      new AbortController().signal,
    ).then(() => { throw new Error('unexpected resolve') }, (error: unknown) => error)
    expect(failure).toMatchObject({ code: 3, stdout: 'partial', stderr: 'boom' })
    expect((failure as Error).cause).toBeInstanceOf(Error)
  })

  it('rejects a missing executable with the spawn ENOENT code', async () => {
    const failure = await runNativeCommand(
      'dsh-definitely-missing-command',
      [],
      new AbortController().signal,
    ).then(() => { throw new Error('unexpected resolve') }, (error: unknown) => error)
    expect(failure).toMatchObject({ code: 'ENOENT' })
  })

  it('terminates the child when the signal aborts', async () => {
    const abort = new AbortController()
    const pending = runNativeCommand(node, ['-e', 'setTimeout(() => {}, 60_000)'], abort.signal)
    abort.abort()
    const failure = await pending.then(() => { throw new Error('unexpected resolve') }, (error: unknown) => error)
    expect(failure).toBeInstanceOf(Error)
    expect((failure as { code?: unknown }).code).toBe('ABORT_ERR')
  })
})

describe('runNativeVisibleCommand', () => {
  it('captures utf8 stdout on exit 0', async () => {
    const result = await runNativeVisibleCommand(
      node,
      ['-e', 'process.stdout.write("shown✓")'],
      new AbortController().signal,
    )
    expect(result).toEqual({ stdout: 'shown✓', stderr: '' })
  })

  it.skipIf(process.platform !== 'win32')('starts the child without the SW_HIDE state that hides the window it opens', async () => {
    // A window opened by the started process itself — Explorer's /select window —
    // inherits this show state: SW_HIDE there is a folder window that arrives
    // invisible, which reads as a reveal that did nothing.
    const script = [
      "$code = @'",
      'using System;',
      'using System.Runtime.InteropServices;',
      'public static class DshStartup {',
      '  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]',
      '  public struct STARTUPINFO {',
      '    public int cb; public IntPtr lpReserved; public IntPtr lpDesktop; public IntPtr lpTitle;',
      '    public int dwX; public int dwY; public int dwXSize; public int dwYSize;',
      '    public int dwXCountChars; public int dwYCountChars; public int dwFillAttribute; public int dwFlags;',
      '    public short wShowWindow; public short cbReserved2;',
      '    public IntPtr lpReserved2; public IntPtr hStdInput; public IntPtr hStdOutput; public IntPtr hStdError;',
      '  }',
      '  [DllImport("kernel32.dll")] public static extern void GetStartupInfo(out STARTUPINFO info);',
      '  public static int ShowState() { STARTUPINFO info; GetStartupInfo(out info); return info.wShowWindow; }',
      '}',
      "'@",
      'Add-Type -TypeDefinition $code',
      '[DshStartup]::ShowState()',
    ].join('\n')
    const args = ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')]
    const lifetime = new AbortController().signal
    const hidden = await runNativeCommand('powershell.exe', args, lifetime)
    const shown = await runNativeVisibleCommand('powershell.exe', args, lifetime)
    expect(hidden.stdout.trim()).toBe('0')
    expect(shown.stdout.trim()).not.toBe('0')
  }, 60_000)
})
