/**
 * `@sasjs/sas-language` publishes its entry points through an `exports` map, and
 * this project's `moduleResolution` cannot read one, so TypeScript reports
 * "Cannot find module '@sasjs/sas-language/format'" even though the package ships
 * the declaration beside the file.
 *
 * Only what this CLI calls is declared, and loosely on purpose: pinning the
 * upstream signature here would mean editing this file whenever it changed. The
 * shape is the documented one, and `FormatOptions` in `@sasjs/lint` states the
 * contract the reprint has to meet.
 */
declare module '@sasjs/sas-language/format' {
  export function formatText(
    text: string,
    options?: {
      tabWidth?: number
      useTabs?: boolean
      dataRoot?: string
      keywordCase?: 'upper' | 'lower' | 'preserve'
    }
  ): Promise<string>
}
