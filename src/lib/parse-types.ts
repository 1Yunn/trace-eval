export interface LineError { line: number | null; reason: string; }
export interface ParsedFile { records: unknown[]; errors: LineError[]; }
