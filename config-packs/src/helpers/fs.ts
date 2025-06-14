import { mkdir, rm } from 'node:fs/promises'

export interface PrepareDirectoryOptions {
  /**
   * The path in which the dev directory will be created.
   */
  path: string

  /**
   * Whether to clean old available files before spitting out the new ones.
   */
  clean?: boolean
}
export async function prepareDirectory(options: PrepareDirectoryOptions) {
  const {
    path,
    clean,
  } = options

  if (clean)
    await rm(path, { recursive: true, force: true })

  await mkdir(path, { recursive: true })
}
