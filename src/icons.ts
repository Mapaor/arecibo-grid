import iconNodes from 'lucide-static/icon-nodes.json';

type IconNode = readonly (readonly [string, Readonly<Record<string, string>>])[];
const nodes = iconNodes as unknown as Record<string, IconNode>;

const attributes: Record<string, string> = {
  'stroke-width': '2',
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
  fill: 'none',
  stroke: 'currentColor',
};

export function lucideIcon(name: string, size = 16): SVGSVGElement {
  const icon = nodes[name];
  if (!icon) throw new Error(`Unknown Lucide icon: ${name}`);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('stroke-width', attributes['stroke-width']);
  svg.setAttribute('stroke-linecap', attributes['stroke-linecap']);
  svg.setAttribute('stroke-linejoin', attributes['stroke-linejoin']);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('lucide-icon');

  for (const [tag, nodeAttributes] of icon) {
    const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(nodeAttributes)) {
      element.setAttribute(key, String(value));
    }
    svg.append(element);
  }
  return svg;
}
