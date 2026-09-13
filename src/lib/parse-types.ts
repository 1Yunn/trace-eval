export interface LineError { line: number | null; reason: string; }
export interface ParsedRecord { value: unknown; line: number | null; }
export interface ParsedFile { records: ParsedRecord[]; errors: LineError[]; }
