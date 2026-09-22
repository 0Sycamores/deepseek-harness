/**
 * Shared no-shell `execFile` runner for host-native OS integrations.
 * @module @deepseek-ai/dsh-native-command/runner
 */

import { execFile } from 'node:child_process'

/** Testable command boundary; native implementations never invoke a shell. */
export type NativeCommandRunner = (
  command: string,
  args: readonly string[],
  signal: AbortSignal,
) => Promise<{ stdout: string; stderr: string }>

/**
 * Run one host command with utf8 stdio, abort propagation, and the caller's choice
 * of Windows visibility.
 * @param command - executable path or PATH name.
 * @param args - argv (never a shell string).
 * @param signal - caller/connection lifetime; abort terminates the child.
 * @param windowsHide - hide the child's console and the show state its own windows inherit.
 * @returns captured stdout/stderr on exit 0.
 */
function execNative(
  command: string,
  args: readonly string[],
  signal: AbortSignal,
  windowsHide: boolean,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      [...args],
      { encoding: 'utf8', signal, windowsHide },
      (error, stdout, stderr) => {
        if (error !== null) {
          const failure = Object.assign(new Error(error.message, { cause: error }), {
            code: error.code,
            stdout,
            stderr,
          })
          reject(failure)
          return
        }
        resolve({ stdout, stderr })
      },
    )
  })
}

/**
 * Run a host command with utf8 stdio, abort propagation, and Windows hide.
 * @param command - executable path or PATH name.
 * @param args - argv (never a shell string).
 * @param signal - caller/connection lifetime; abort terminates the child.
 * @returns captured stdout/stderr on exit 0.
 */
export const runNativeCommand: NativeCommandRunner = (command, args, signal) =>
  execNative(command, args, signal, true)

/**
 * Run a host command whose own process may display a window.
 *
 * `windowsHide` passes `STARTF_USESHOWWINDOW` with `SW_HIDE` to the started
 * process, and the first window that process itself opens inherits that show
 * state: `explorer.exe /select,` started this way creates the requested folder
 * window with the file selected and never displays it, while the command still
 * reports a delegated handoff. Commands whose window belongs to another process
 * (PowerShell handing the request to the desktop) keep the hidden console of
 * {@link runNativeCommand}.
 * @param command - executable path or PATH name.
 * @param args - argv (never a shell string).
 * @param signal - caller/connection lifetime; abort terminates the child.
 * @returns captured stdout/stderr on exit 0.
 */
export const runNativeVisibleCommand: NativeCommandRunner = (command, args, signal) =>
  execNative(command, args, signal, false)
