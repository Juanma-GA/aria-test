import { promises as fs } from 'fs';
import path from 'path';

/**
 * Reads a reference file from /references/ directory.
 * Returns empty string if file not found (no throw — app must not crash).
 */
async function readReference(filename: string): Promise<string> {
  try {
    const filePath = path.join(process.cwd(), 'references', filename);
    const content = await fs.readFile(filePath, 'utf-8');
    return content;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.warn(`[References] Unable to read ${filename}: ${errorMsg}`);
    return '';
  }
}

/**
 * Reads the technology landscape reference file.
 * Returns full content of state-of-the-art.md for injection into AI prompts.
 */
export async function getStateOfTheArt(): Promise<string> {
  return readReference('state-of-the-art.md');
}

/**
 * Reads the TechPubs use case catalog reference file.
 * Returns full content of techpubs-use-cases.md for injection into AI prompts.
 */
export async function getUseCases(): Promise<string> {
  return readReference('techpubs-use-cases.md');
}

/**
 * Reads the ATEXIS developed tools catalog reference file.
 * Returns full content of developed-tools.md for TechPubs cost estimation.
 */
export async function getDevelopedTools(): Promise<string> {
  return readReference('developed-tools.md');
}
