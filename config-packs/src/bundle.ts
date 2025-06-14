import { bundleConfigPack } from 'config-rocket'
import { resolve } from 'pathe'
import { prepareDirectory } from './helpers/fs'

async function entry() {
  const outDir = resolve(import.meta.dirname, '../binary')

  // Clean old dist files
  await prepareDirectory({
    path: outDir,
    clean: true,
  })

  // Add as much `bundleConfigPack` as you want here

  await bundleConfigPack({
    rocketConfig: resolve(import.meta.dirname, 'assembly/roo-rocket/github-semantic-search-server/rocket.config.ts'),
    fuelDir: resolve(import.meta.dirname, 'assembly/@fuel-garage'),
    outDir,
    outName: 'github-semantic-search-server-mcp',
  })
}
await entry()
