import { subscribe } from '@parcel/watcher'
import { rocketAssemble } from 'config-rocket'
import { debounce, throttle } from 'kontroll'
import { join } from 'pathe'
import { logger } from '~/helpers/logger'
import { prepareDirectory } from './fs'

export interface StartDevelopmentCycleOptions {
  /**
   * Path to the target dev subject directory (frame and config)
   */
  targetDevSubject: string

  /**
   * Path to the fuel directory
   */
  fuelDir: string

  /**
   * Path to the dev directory
   */
  devDir: string

  /**
   * Whether to clean the dev directory upon `assemble` triggers
   */
  cleanOnReassemble?: boolean
}
export async function startDevelopmentCycle(options: StartDevelopmentCycleOptions) {
  const {
    targetDevSubject,
    fuelDir,
    devDir,
    cleanOnReassemble,
  } = options

  // Prepare dev dir
  logger.start('Dev started, preparing dev dir...')
  await prepareDirectory({
    path: devDir,
    clean: true,
  })

  // Local assemble fn
  let cancelCurrentPromise = () => { }
  const assemble = async () => {
    return await new Promise((resolve, reject) => {
      cancelCurrentPromise = () => {
        // eslint-disable-next-line prefer-promise-reject-errors
        reject('cancelled')
        cancelCurrentPromise = () => { }
      }

      rocketAssemble({
        frameDir: join(targetDevSubject, 'frame'),
        fuelDir,
        outDir: devDir,
      }).then(resolve)
    }).catch((e) => {
      if (e === 'cancelled')
        return logger.debug('Assemble cancelled.')

      throw e
    }).then(() => { logger.success('Assemble done successfully.') })
  }

  // Subcribe for troop folder changes and re-assemble
  subscribe(targetDevSubject, (err, _events) => {
    if (err)
      throw err

    throttle(1000, () => logger.info('FS changes received, re-triggering "assemble"...'))
    cancelCurrentPromise()
    debounce(
      1000,
      async () => {
        if (cleanOnReassemble) {
          await prepareDirectory({
            path: devDir,
            clean: true,
          })
        }
        await assemble()
      },
      { key: 'assemble' },
    )
  })

  // Initial assemble, using `debounce` wrapper here ensure that only one `assemble` event is running at a time, avoiding possible bugs.
  logger.start('Initial assemble...')
  debounce(
    1000,
    assemble,
    { key: 'assemble', leading: true },
  )
}
