import { resolve } from 'pathe'
import { startDevelopmentCycle } from '~/helpers/dev'

async function entry() {
  // Change your target dev subject here:
  const targetDevSubject = resolve(import.meta.dirname, 'assembly/roo-rocket/github-semantic-search-servertest')
  const fuelDir = resolve(import.meta.dirname, 'assembly/@fuel-garage')
  const devDir = resolve(import.meta.dirname, '../.config-dev')
  const cleanOnReassemble = true

  await startDevelopmentCycle({
    targetDevSubject,
    fuelDir,
    devDir,
    cleanOnReassemble,
  })
}
await entry()
