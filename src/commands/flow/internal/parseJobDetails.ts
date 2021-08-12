export const parseJobDetails = (response: any) => {
  if (!response) return

  let details = ''

  const concatDetails = (data: any, title: string) => {
    if (data)
      details = details.concat(
        details.length ? ' | ' : '',
        `${title}: ${Object.keys(data)
          .map((key) => `${key}: ${data[key]}`)
          .join('; ')}`
      )
  }

  concatDetails(response.statistics, 'Statistics')
  concatDetails(response.listingStatistics, 'Listing Statistics')
  concatDetails(response.logStatistics, 'Log Statistics')

  let lineCount = 1000000

  if (response.logStatistics && response.logStatistics.lineCount) {
    lineCount = parseInt(response.logStatistics.lineCount)
  }

  return { details, lineCount }
}
