export interface LogLine {
  line: string
}

export interface LogJson {
  items: LogLine[]
  error?: object
}
