import 'server-only'
import fs from 'fs'
import path from 'path'

/**
 * Mount guard shared by Documents (`FILES_ROOT`) and Photos (`PHOTOS_ROOT`).
 * Kept free of other lib imports so both can use it without an import cycle
 * (lib/photos/config imports lib/files).
 */

/** `NAS_REQUIRE_MOUNT=1` (set on the Pi): storage roots must be mount points to count as online. */
export function mountRequired(): boolean {
  return process.env.NAS_REQUIRE_MOUNT === '1'
}

/**
 * True when `abs` (symlinks resolved) is a directory on a different device than
 * its parent directory, i.e. something is mounted there. Errors (missing path,
 * stale NFS handle, permission) count as "not a mount point". `/` is reported as
 * false (its parent is itself).
 */
export async function isMountPoint(abs: string): Promise<boolean> {
  try {
    const real = await fs.promises.realpath(abs)
    const parent = path.dirname(real)
    if (parent === real) return false
    const [self, up] = await Promise.all([fs.promises.stat(real), fs.promises.stat(parent)])
    return self.isDirectory() && self.dev !== up.dev
  } catch {
    return false
  }
}

/** True when `abs` is a readable directory and, with NAS_REQUIRE_MOUNT=1, a mount point. */
export async function rootOnline(abs: string): Promise<boolean> {
  try {
    if (!(await fs.promises.stat(abs)).isDirectory()) return false
  } catch {
    return false
  }
  return !mountRequired() || isMountPoint(abs)
}
