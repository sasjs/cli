import { generateTimestamp } from '@sasjs/utils'

export const generateFileName = (flowName: string, jobLocation: string) =>
  `${flowName}_${jobLocation
    .split('/')
    .splice(-1, 1)
    .join('')
    .replace(/\W/g, '_')}_${generateTimestamp('_')}.log`
