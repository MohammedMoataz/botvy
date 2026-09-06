import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
// prompts/ lives at the app root, two levels up from dist/llm or src/llm.
const PROMPTS_DIR = join(__dirname, '..', '..', 'prompts');

export function loadPrompt(name: string, vars: Record<string, string> = {}): string {
  let text = readFileSync(join(PROMPTS_DIR, name), 'utf8');
  for (const [key, value] of Object.entries(vars)) {
    text = text.replaceAll(`{{${key}}}`, value);
  }
  return text;
}
