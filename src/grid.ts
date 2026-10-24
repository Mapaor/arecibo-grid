export const MAX_PRIME = 2027;

export function createPrimeList(max: number): number[] {
  const isPrime = new Uint8Array(max + 1).fill(1);
  isPrime[0] = 0;
  if (max >= 1) isPrime[1] = 0;

  for (let value = 2; value * value <= max; value += 1) {
    if (!isPrime[value]) continue;
    for (let multiple = value * value; multiple <= max; multiple += value) {
      isPrime[multiple] = 0;
    }
  }

  return Array.from({ length: Math.max(0, max - 1) }, (_, index) => index + 2)
    .filter((value) => isPrime[value] === 1);
}

export const PRIMES = createPrimeList(MAX_PRIME);
const PRIME_INDEX = new Map(PRIMES.map((prime, index) => [prime, index]));

export interface Grid {
  width: number;
  height: number;
  cells: Uint8Array;
}

export function isAllowedPair(width: number, height: number): boolean {
  const widthIndex = PRIME_INDEX.get(width);
  const heightIndex = PRIME_INDEX.get(height);
  if (widthIndex === undefined || heightIndex === undefined) return false;
  return Math.abs(widthIndex - heightIndex) - 1 < 25;
}


export function createGrid(width: number, height: number): Grid {
  return { width, height, cells: new Uint8Array(width * height) };
}

export function serializeGrid(grid: Grid): string {
  const bits = new Array<string>(grid.cells.length);
  for (let index = 0; index < grid.cells.length; index += 1) {
    bits[index] = grid.cells[index] ? '1' : '0';
  }
  return `${grid.width} ${grid.height}\n${bits.join('')}\n`;
}

export function parseGridText(text: string): Grid {
  const newline = text.search(/\r?\n/);
  if (newline < 0) throw new Error('Add a second line containing the grid bits.');

  const header = text.slice(0, newline).trim();
  const match = /^(\d+)\s+(\d+)$/.exec(header);
  if (!match) throw new Error('The first line must contain width and height, separated by a space.');

  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!PRIME_INDEX.has(width) || !PRIME_INDEX.has(height)) {
    throw new Error(`Width and height must be prime numbers from 2 to ${MAX_PRIME}.`);
  }
  if (!isAllowedPair(width, height)) {
    throw new Error('Choose dimensions with fewer than 25 prime numbers between them.');
  }

  const dataStart = newline + (text[newline] === '\r' ? 2 : 1);
  const rawBits = text.slice(dataStart);
  if (/[^01\s]/.test(rawBits)) throw new Error('Grid data can contain only 0s, 1s, and whitespace.');
  const bits = rawBits.replace(/\s/g, '');
  const expectedLength = width * height;
  if (bits.length !== expectedLength) {
    throw new Error(`This grid needs exactly ${expectedLength.toLocaleString()} bits; found ${bits.length.toLocaleString()}.`);
  }

  const cells = new Uint8Array(expectedLength);
  for (let index = 0; index < bits.length; index += 1) cells[index] = bits.charCodeAt(index) - 48;
  return { width, height, cells };
}
