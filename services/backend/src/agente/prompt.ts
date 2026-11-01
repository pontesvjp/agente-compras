import { readFile } from 'node:fs/promises';

/** Funciona a partir de src/ (testes) e de dist/ (build): os dois ficam a dois níveis da raiz do pacote. */
const CAMINHO_PROMPT = new URL('../../src/agente/prompt.md', import.meta.url);

export async function lerPrompt(caminho: URL = CAMINHO_PROMPT): Promise<string> {
  const texto = (await readFile(caminho, 'utf8')).trim();
  if (texto === '') throw new Error(`O prompt do agente está vazio: ${caminho.pathname}`);
  return texto;
}
