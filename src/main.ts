import { createGrid, isAllowedPair, MAX_PRIME, parseGridText, PRIMES, serializeGrid, type Grid } from './grid';
import { GRID_EXAMPLES } from './examples';
import './style.css';

const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as T;
};

const widthSelect = byId<HTMLSelectElement>('width-select');
const heightSelect = byId<HTMLSelectElement>('height-select');
const swapDimensionsButton = byId<HTMLButtonElement>('swap-dimensions-button');
const summary = byId('dimension-summary');
const interpretationSelect = byId<HTMLSelectElement>('interpretation-select');
const canvas = byId<HTMLCanvasElement>('grid-canvas');
const canvasWrap = byId('canvas-wrap');
const zoomLabel = byId('zoom-label');
const status = byId('grid-status');
const activeCount = byId('active-count');
const message = byId('message');
const fileInput = byId<HTMLInputElement>('file-input');
const exampleSelect = byId<HTMLSelectElement>('example-select');
const context = canvas.getContext('2d');
if (!context) throw new Error('Canvas 2D is not available in this browser.');

type Interpretation = 'default' | 'right-to-left' | 'bottom-to-top' | 'rotate-180';

let grid: Grid = createGrid(23, 23);
let interpretation: Interpretation = 'default';
let raster = document.createElement('canvas');
let scale = 1;
let offsetX = 0;
let offsetY = 0;
let viewportWidth = 0;
let viewportHeight = 0;
let drawingPointer: number | null = null;
let drawingValue = 1;
let panPointer: number | null = null;
let panStart = { x: 0, y: 0, offsetX: 0, offsetY: 0 };
let spaceDown = false;
let activeCell = { x: 0, y: 0 };
let selectionAnchor: { x: number; y: number } | null = null;
let selectionHead: { x: number; y: number } | null = null;
let activeCells = 0;
let renderedFrame = 0;
let clearConfirmationTimer = 0;
let clearArmed = false;
const clearButton = byId<HTMLButtonElement>('clear-grid-button');

function hasActiveCells(): boolean {
  return activeCells > 0;
}

function showMessage(text: string, kind: 'success' | 'error' | 'info' = 'info'): void {
  message.textContent = text;
  message.className = `message is-visible ${kind}`;
}

function populateSelects(): void {
  for (const select of [widthSelect, heightSelect]) {
    const fragment = document.createDocumentFragment();
    for (const prime of PRIMES) {
      const option = document.createElement('option');
      option.value = String(prime);
      option.textContent = String(prime);
      fragment.append(option);
    }
    select.replaceChildren(fragment);
  }
  updateDimensionOptions();
}

function loadExample(exampleId: string): void {
  const example = GRID_EXAMPLES.find(({ id }) => id === exampleId);
  if (!example) return;
  if (hasActiveCells() && !window.confirm('Loading this example will replace your current design. Continue?')) {
    exampleSelect.value = '';
    return;
  }

  grid = { ...example.grid, cells: example.grid.cells.slice() };
  activeCells = grid.cells.reduce((total, cell) => total + cell, 0);
  activeCell = { x: 0, y: 0 };
  selectionAnchor = null;
  selectionHead = null;
  widthSelect.value = String(grid.width);
  heightSelect.value = String(grid.height);
  updateDimensionOptions();
  updateSummary();
  createRaster();
  updateStatus();
  fitToWidth();
  showMessage(`${example.name} loaded.`, 'success');
  exampleSelect.value = '';
}

function updateDimensionOptions(): void {
  const width = Number(widthSelect.value);
  const height = Number(heightSelect.value);
  for (const option of Array.from(widthSelect.options)) {
    const outsideRange = !isAllowedPair(Number(option.value), height);
    option.classList.toggle('outside-range', outsideRange);
    option.style.color = outsideRange ? '#a6aba7' : '';
  }
  for (const option of Array.from(heightSelect.options)) {
    const outsideRange = !isAllowedPair(width, Number(option.value));
    option.classList.toggle('outside-range', outsideRange);
    option.style.color = outsideRange ? '#a6aba7' : '';
  }
}


function handleDimensionChange(changed: 'width' | 'height'): void {
  let width = Number(widthSelect.value);
  let height = Number(heightSelect.value);
  if (!isAllowedPair(width, height)) {
    if (changed === 'width') {
      height = width;
      heightSelect.value = String(height);
    } else {
      width = height;
      widthSelect.value = String(width);
    }
  }

  updateDimensionOptions();
  updateSummary();
  applyDimensions(width, height);
}

function swapDimensions(): void {
  const previousWidth = grid.width;
  grid = { ...grid, width: grid.height, height: previousWidth };
  widthSelect.value = String(grid.width);
  heightSelect.value = String(grid.height);
  updateDimensionOptions();
  updateSummary();
  activeCell.x = Math.min(activeCell.x, grid.width - 1);
  activeCell.y = Math.min(activeCell.y, grid.height - 1);
  if (selectionAnchor && selectionHead) {
    selectionAnchor.x = Math.min(selectionAnchor.x, grid.width - 1);
    selectionAnchor.y = Math.min(selectionAnchor.y, grid.height - 1);
    selectionHead.x = Math.min(selectionHead.x, grid.width - 1);
    selectionHead.y = Math.min(selectionHead.y, grid.height - 1);
  }
  createRaster();
  updateStatus();
  fitToWidth();
  showMessage('Grid dimensions swapped; binary data unchanged.', 'success');
}

function updateSummary(): void {
  const width = Number(widthSelect.value);
  const height = Number(heightSelect.value);
  summary.textContent = `${(width * height).toLocaleString()} cells`;
}

function visualToDataCell(x: number, y: number): { x: number; y: number } {
  switch (interpretation) {
    case 'right-to-left':
      return { x: grid.width - 1 - x, y };
    case 'bottom-to-top':
      return { x, y: grid.height - 1 - y };
    case 'rotate-180':
      return { x: grid.width - 1 - x, y: grid.height - 1 - y };
    default:
      return { x, y };
  }
}

function dataToVisualCell(x: number, y: number): { x: number; y: number } {
  return visualToDataCell(x, y);
}

function updateStatus(): void {
  activeCount.textContent = activeCells.toLocaleString();
  status.textContent = `${grid.width} × ${grid.height} grid`;
}

function createRaster(): void {
  raster = document.createElement('canvas');
  raster.width = grid.width;
  raster.height = grid.height;
  const rasterContext = raster.getContext('2d');
  if (!rasterContext) return;

  const image = rasterContext.createImageData(grid.width, grid.height);
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const { x: dataX, y: dataY } = visualToDataCell(x, y);
      const index = dataY * grid.width + dataX;
      const pixel = (y * grid.width + x) * 4;
      const color = grid.cells[index] ? 20 : 255;
      image.data[pixel] = color;
      image.data[pixel + 1] = color;
      image.data[pixel + 2] = color;
      image.data[pixel + 3] = 255;
    }
  }
  rasterContext.putImageData(image, 0, 0);
}

function fitToWidth(): void {
  if (!viewportWidth || !viewportHeight) return;
  scale = Math.max(0.12, Math.min(72, (viewportWidth - 64) / grid.width));
  offsetX = (viewportWidth - grid.width * scale) / 2;
  offsetY = (viewportHeight - grid.height * scale) / 2;
  scheduleRender();
}

function fitToHeight(): void {
  if (!viewportWidth || !viewportHeight) return;
  scale = Math.max(0.12, Math.min(72, (viewportHeight - 64) / grid.height));
  offsetX = (viewportWidth - grid.width * scale) / 2;
  offsetY = (viewportHeight - grid.height * scale) / 2;
  scheduleRender();
}

function scheduleRender(): void {
  if (renderedFrame) return;
  renderedFrame = requestAnimationFrame(render);
}

function render(): void {
  renderedFrame = 0;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const targetWidth = Math.max(1, Math.round(viewportWidth * dpr));
  const targetHeight = Math.max(1, Math.round(viewportHeight * dpr));
  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }

  context!.setTransform(dpr, 0, 0, dpr, 0, 0);
  context!.clearRect(0, 0, viewportWidth, viewportHeight);
  context!.fillStyle = '#eeede8';
  context!.fillRect(0, 0, viewportWidth, viewportHeight);
  context!.imageSmoothingEnabled = false;
  context!.drawImage(raster, offsetX, offsetY, grid.width * scale, grid.height * scale);

  if (scale >= 7) drawGridLines();
  if (selectionAnchor && selectionHead) {
    const visualAnchor = dataToVisualCell(selectionAnchor.x, selectionAnchor.y);
    const visualHead = dataToVisualCell(selectionHead.x, selectionHead.y);
    const left = Math.min(visualAnchor.x, visualHead.x);
    const top = Math.min(visualAnchor.y, visualHead.y);
    const right = Math.max(visualAnchor.x, visualHead.x);
    const bottom = Math.max(visualAnchor.y, visualHead.y);
    context!.fillStyle = 'rgba(200, 117, 72, 0.18)';
    context!.fillRect(offsetX + left * scale, offsetY + top * scale, (right - left + 1) * scale, (bottom - top + 1) * scale);
    context!.strokeStyle = '#c87548';
    context!.lineWidth = 2;
    context!.strokeRect(offsetX + left * scale + 1, offsetY + top * scale + 1, Math.max(0, (right - left + 1) * scale - 2), Math.max(0, (bottom - top + 1) * scale - 2));
  }
  if (activeCell.x >= 0 && activeCell.x < grid.width && activeCell.y >= 0 && activeCell.y < grid.height) {
    const activeVisual = dataToVisualCell(activeCell.x, activeCell.y);
    context!.strokeStyle = '#d1814b';
    context!.lineWidth = Math.max(1, 1.5 / dpr);
    context!.strokeRect(offsetX + activeVisual.x * scale + 1, offsetY + activeVisual.y * scale + 1, Math.max(0, scale - 2), Math.max(0, scale - 2));
  }
  zoomLabel.textContent = `${Math.round((scale / initialFitScale()) * 100)}%`;
}

function initialFitScale(): number {
  return Math.max(0.12, Math.min(72, Math.min((viewportWidth - 64) / grid.width, (viewportHeight - 64) / grid.height)));
}

function drawGridLines(): void {
  const left = Math.max(0, Math.floor(-offsetX / scale));
  const right = Math.min(grid.width, Math.ceil((viewportWidth - offsetX) / scale));
  const top = Math.max(0, Math.floor(-offsetY / scale));
  const bottom = Math.min(grid.height, Math.ceil((viewportHeight - offsetY) / scale));
  if ((right - left) * (bottom - top) > 100_000) return;

  context!.beginPath();
  context!.strokeStyle = 'rgba(19, 28, 35, 0.17)';
  context!.lineWidth = 1;
  for (let x = left; x <= right; x += 1) {
    const px = Math.round(offsetX + x * scale) + 0.5;
    context!.moveTo(px, offsetY + top * scale);
    context!.lineTo(px, offsetY + bottom * scale);
  }
  for (let y = top; y <= bottom; y += 1) {
    const py = Math.round(offsetY + y * scale) + 0.5;
    context!.moveTo(offsetX + left * scale, py);
    context!.lineTo(offsetX + right * scale, py);
  }
  context!.stroke();
}

function updateCell(x: number, y: number, value: number): void {
  if (x < 0 || x >= grid.width || y < 0 || y >= grid.height) return;
  const { x: dataX, y: dataY } = visualToDataCell(x, y);
  const index = dataY * grid.width + dataX;
  if (grid.cells[index] === value) return;
  grid.cells[index] = value;
  activeCells += value ? 1 : -1;
  const rasterContext = raster.getContext('2d');
  if (rasterContext) {
    const visual = dataToVisualCell(dataX, dataY);
    rasterContext.fillStyle = value ? '#141414' : '#ffffff';
    rasterContext.fillRect(visual.x, visual.y, 1, 1);
  }
  updateStatus();
  scheduleRender();
}

function visualCellAt(clientX: number, clientY: number): { x: number; y: number } | null {
  const bounds = canvas.getBoundingClientRect();
  const x = Math.floor((clientX - bounds.left - offsetX) / scale);
  const y = Math.floor((clientY - bounds.top - offsetY) / scale);
  if (x < 0 || x >= grid.width || y < 0 || y >= grid.height) return null;
  return { x, y };
}

function cellAt(clientX: number, clientY: number): { x: number; y: number } | null {
  const visualCell = visualCellAt(clientX, clientY);
  return visualCell ? visualToDataCell(visualCell.x, visualCell.y) : null;
}

function ensureActiveCellVisible(): void {
  const activeVisual = dataToVisualCell(activeCell.x, activeCell.y);
  const cellLeft = offsetX + activeVisual.x * scale;
  const cellTop = offsetY + activeVisual.y * scale;
  const cellRight = cellLeft + scale;
  const cellBottom = cellTop + scale;
  if (cellLeft < 0) offsetX -= cellLeft;
  else if (cellRight > viewportWidth) offsetX -= cellRight - viewportWidth;
  if (cellTop < 0) offsetY -= cellTop;
  else if (cellBottom > viewportHeight) offsetY -= cellBottom - viewportHeight;
}

function zoomAt(clientX: number, clientY: number, factor: number): void {
  const bounds = canvas.getBoundingClientRect();
  const pointerX = clientX - bounds.left;
  const pointerY = clientY - bounds.top;
  const nextScale = Math.max(0.12, Math.min(72, scale * factor));
  const ratio = nextScale / scale;
  offsetX = pointerX - (pointerX - offsetX) * ratio;
  offsetY = pointerY - (pointerY - offsetY) * ratio;
  scale = nextScale;
  scheduleRender();
}

function clearGrid(): void {
  if (!hasActiveCells()) {
    showMessage('The grid is already empty.', 'info');
    return;
  }

  if (!clearArmed) {
    clearArmed = true;
    clearButton.textContent = 'Click again to clear';
    clearButton.setAttribute('aria-label', 'Confirm clearing the grid');
    clearButton.classList.add('is-armed');
    window.clearTimeout(clearConfirmationTimer);
    clearConfirmationTimer = window.setTimeout(() => {
      clearArmed = false;
      clearButton.textContent = 'Clear grid';
      clearButton.setAttribute('aria-label', 'Clear grid');
      clearButton.classList.remove('is-armed');
    }, 3000);
    showMessage('Click “Click again to clear” within 3 seconds to erase the grid.', 'info');
    return;
  }

  window.clearTimeout(clearConfirmationTimer);
  clearArmed = false;
  clearButton.textContent = 'Clear grid';
  clearButton.setAttribute('aria-label', 'Clear grid');
  clearButton.classList.remove('is-armed');
  grid.cells.fill(0);
  selectionAnchor = null;
  selectionHead = null;
  activeCells = 0;
  const rasterContext = raster.getContext('2d');
  if (rasterContext) {
    rasterContext.fillStyle = '#ffffff';
    rasterContext.fillRect(0, 0, grid.width, grid.height);
  }
  updateStatus();
  scheduleRender();
  showMessage('Grid cleared.', 'success');
}

function applyDimensions(width: number, height: number): void {
  if (width === grid.width && height === grid.height) return;
  if (hasActiveCells() && !window.confirm('Changing the dimensions clears your current design. Continue?')) {
    widthSelect.value = String(grid.width);
    heightSelect.value = String(grid.height);
    updateDimensionOptions();
    updateSummary();
    return;
  }

  grid = createGrid(width, height);
  selectionAnchor = null;
  selectionHead = null;
  activeCells = 0;
  activeCell = { x: 0, y: 0 };
  createRaster();
  updateStatus();
  fitToWidth();
  showMessage('New blank grid created.', 'success');
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function exportText(): void {
  const text = serializeGrid(grid);
  download(new Blob([text], { type: 'text/plain;charset=utf-8' }), `arecibo-grid-${grid.width}x${grid.height}.txt`);
  showMessage('Plain-text design exported.', 'success');
}

function exportImage(): void {
  const filledRuns: string[] = [];
  for (let y = 0; y < grid.height; y += 1) {
    let x = 0;
    while (x < grid.width) {
      while (x < grid.width && grid.cells[y * grid.width + x] === 0) x += 1;
      if (x === grid.width) break;
      const start = x;
      while (x < grid.width && grid.cells[y * grid.width + x] === 1) x += 1;
      filledRuns.push(`<rect x="${start}" y="${y}" width="${x - start}" height="1"/>`);
    }
  }

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${grid.width}" height="${grid.height}" viewBox="0 0 ${grid.width} ${grid.height}" shape-rendering="crispEdges">`,
    '<rect width="100%" height="100%" fill="#fff"/>',
    `<g fill="#141414">${filledRuns.join('')}</g>`,
    '</svg>',
  ].join('');
  download(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), `arecibo-grid-${grid.width}x${grid.height}.svg`);
  showMessage('Scalable SVG image exported.', 'success');
}

function importTextFile(file: File): void {
  const reader = new FileReader();
  reader.addEventListener('load', () => {
    try {
      const imported = parseGridText(String(reader.result ?? ''));
      if (hasActiveCells() && !window.confirm('Importing this file will replace your current design. Continue?')) return;
      grid = imported;
      selectionAnchor = null;
      selectionHead = null;
      activeCells = grid.cells.reduce((total, cell) => total + cell, 0);
      widthSelect.value = String(grid.width);
      heightSelect.value = String(grid.height);
      updateDimensionOptions();
      updateSummary();
      activeCell = { x: 0, y: 0 };
      createRaster();
      updateStatus();
      fitToWidth();
      showMessage('Text design imported successfully.', 'success');
    } catch (error) {
      showMessage(error instanceof Error ? error.message : 'Could not read this design file.', 'error');
    }
  });
  reader.addEventListener('error', () => showMessage('Could not read the selected file.', 'error'));
  reader.readAsText(file);
}

populateSelects();
for (const example of GRID_EXAMPLES) {
  const option = document.createElement('option');
  option.value = example.id;
  option.textContent = example.name;
  exampleSelect.append(option);
}
exampleSelect.addEventListener('change', () => loadExample(exampleSelect.value));
widthSelect.value = '23';
heightSelect.value = '23';
updateDimensionOptions();
updateSummary();
createRaster();
updateStatus();

widthSelect.addEventListener('change', () => handleDimensionChange('width'));
heightSelect.addEventListener('change', () => handleDimensionChange('height'));
swapDimensionsButton.addEventListener('click', swapDimensions);
interpretationSelect.addEventListener('change', () => {
  interpretation = interpretationSelect.value as Interpretation;
  createRaster();
  scheduleRender();
});

function zoomAtCenter(factor: number): void {
  const bounds = canvas.getBoundingClientRect();
  zoomAt(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2, factor);
}

byId('zoom-in').addEventListener('click', () => zoomAtCenter(1.25));
byId('zoom-out').addEventListener('click', () => zoomAtCenter(0.8));
const fullscreenButton = byId<HTMLButtonElement>('fullscreen-button');
fullscreenButton.addEventListener('click', async () => {
  try {
    if (document.fullscreenElement === canvasWrap) await document.exitFullscreen();
    else await canvasWrap.requestFullscreen();
  } catch {
    showMessage('Full screen is not available in this browser.', 'error');
  }
});
document.addEventListener('fullscreenchange', () => {
  const isFullscreen = document.fullscreenElement === canvasWrap;
  fullscreenButton.textContent = isFullscreen ? '×' : '⛶';
  fullscreenButton.setAttribute('aria-label', isFullscreen ? 'Exit full screen' : 'Enter full screen');
  fullscreenButton.title = isFullscreen ? 'Exit full screen' : 'Enter full screen';
  requestAnimationFrame(() => {
    const bounds = canvasWrap.getBoundingClientRect();
    viewportWidth = bounds.width;
    viewportHeight = bounds.height;
    fitToWidth();
  });
});
byId('fit-width-button').addEventListener('click', fitToWidth);
byId('fit-height-button').addEventListener('click', fitToHeight);
byId('clear-grid-button').addEventListener('click', clearGrid);
byId('export-text-button').addEventListener('click', exportText);
byId('export-image-button').addEventListener('click', exportImage);
byId('import-button').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) importTextFile(file);
  fileInput.value = '';
});

canvas.addEventListener('pointerdown', (event) => {
  canvas.focus({ preventScroll: true });
  if (event.button === 1 || spaceDown) {
    panPointer = event.pointerId;
    panStart = { x: event.clientX, y: event.clientY, offsetX, offsetY };
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('is-panning');
    event.preventDefault();
    return;
  }
  if (event.button !== 0) return;
  const cell = cellAt(event.clientX, event.clientY);
  if (!cell) return;
  activeCell = cell;
  drawingPointer = event.pointerId;
  drawingValue = grid.cells[cell.y * grid.width + cell.x] ? 0 : 1;
  updateCell(cell.x, cell.y, drawingValue);
  canvas.setPointerCapture(event.pointerId);
  event.preventDefault();
});

canvas.addEventListener('pointermove', (event) => {
  if (panPointer === event.pointerId) {
    offsetX = panStart.offsetX + event.clientX - panStart.x;
    offsetY = panStart.offsetY + event.clientY - panStart.y;
    scheduleRender();
    return;
  }
  if (drawingPointer !== event.pointerId) return;
  const cell = cellAt(event.clientX, event.clientY);
  if (!cell) return;
  activeCell = cell;
  updateCell(cell.x, cell.y, drawingValue);
});

function endPointer(event: PointerEvent): void {
  if (drawingPointer === event.pointerId) drawingPointer = null;
  if (panPointer === event.pointerId) {
    panPointer = null;
    canvas.classList.remove('is-panning');
  }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('lostpointercapture', endPointer);

canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 1.15 : 1 / 1.15);
}, { passive: false });

canvas.addEventListener('keydown', (event) => {
  const moves: Record<string, [number, number]> = {
    ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  };
  if (event.ctrlKey && (event.key === '+' || event.key === '=')) {
    event.preventDefault();
    zoomAtCenter(1.25);
  } else if (event.ctrlKey && event.key === '-') {
    event.preventDefault();
    zoomAtCenter(0.8);
  } else if (event.key in moves) {
    event.preventDefault();
    const [dx, dy] = moves[event.key];
    if (event.shiftKey) {
      if (!selectionAnchor) selectionAnchor = { ...activeCell };
      activeCell.x = Math.max(0, Math.min(grid.width - 1, activeCell.x + dx));
      activeCell.y = Math.max(0, Math.min(grid.height - 1, activeCell.y + dy));
      selectionHead = { ...activeCell };
    } else {
      selectionAnchor = null;
      selectionHead = null;
      activeCell.x = Math.max(0, Math.min(grid.width - 1, activeCell.x + dx));
      activeCell.y = Math.max(0, Math.min(grid.height - 1, activeCell.y + dy));
    }
    ensureActiveCellVisible();
    scheduleRender();
  } else if (event.code === 'Space') {
    event.preventDefault();
    const left = selectionAnchor && selectionHead ? Math.min(selectionAnchor.x, selectionHead.x) : activeCell.x;
    const right = selectionAnchor && selectionHead ? Math.max(selectionAnchor.x, selectionHead.x) : activeCell.x;
    const top = selectionAnchor && selectionHead ? Math.min(selectionAnchor.y, selectionHead.y) : activeCell.y;
    const bottom = selectionAnchor && selectionHead ? Math.max(selectionAnchor.y, selectionHead.y) : activeCell.y;
    const targetValue = grid.cells[top * grid.width + left] ? 0 : 1;
    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) updateCell(x, y, targetValue);
    }
  }
});

window.addEventListener('keydown', (event) => { if (event.code === 'Space' && event.target === canvas) spaceDown = true; });
window.addEventListener('keyup', (event) => { if (event.code === 'Space') spaceDown = false; });
canvas.addEventListener('contextmenu', (event) => event.preventDefault());

const resizeObserver = new ResizeObserver(() => {
  const bounds = canvasWrap.getBoundingClientRect();
  const wasUninitialized = viewportWidth === 0 || viewportHeight === 0;
  viewportWidth = bounds.width;
  viewportHeight = bounds.height;
  if (wasUninitialized) fitToWidth();
  else scheduleRender();
});
resizeObserver.observe(canvasWrap);

if (MAX_PRIME !== PRIMES[PRIMES.length - 1]) showMessage('Prime list initialization failed.', 'error');
