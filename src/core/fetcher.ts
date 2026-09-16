import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const USER_AGENT =
  'CupomSearchBot/0.1 (+https://github.com/LeonardoVini/cupom-search) Mozilla/5.0 (compatible)';
const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 10_000;

export class FetchError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function isPrivateIPv4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const v = ip.toLowerCase();
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
}

/** Bloqueia URLs que apontam para a rede interna (defesa contra SSRF). */
export async function assertPublicUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new FetchError('URL inválida.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new FetchError('Somente links http(s) são aceitos.');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const literal = isIP(host);
  const addresses = literal
    ? [{ address: host, family: literal }]
    : await lookup(host, { all: true }).catch(() => {
        throw new FetchError('Não consegui resolver o domínio do link.');
      });
  for (const { address, family } of addresses) {
    const blocked = family === 4 ? isPrivateIPv4(address) : isPrivateIPv6(address);
    if (blocked) throw new FetchError('Esse endereço aponta para uma rede interna.', 403);
  }
  return url;
}

/** GET com timeout, limite de tamanho e user-agent identificável. */
export async function fetchHtml(rawUrl: string): Promise<string> {
  const url = await assertPublicUrl(rawUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'pt-BR,pt;q=0.9',
      },
    });
    if (!res.ok) throw new FetchError(`A loja respondeu ${res.status}.`, 502);
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('html') && !type.includes('xml')) {
      throw new FetchError('O link não aponta para uma página de produto.', 415);
    }
    const buffer = await res.arrayBuffer();
    return new TextDecoder('utf-8').decode(buffer.slice(0, MAX_BYTES));
  } catch (err) {
    if (err instanceof FetchError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new FetchError('A loja demorou demais para responder.', 504);
    }
    throw new FetchError('Não consegui abrir esse link.', 502);
  } finally {
    clearTimeout(timer);
  }
}
