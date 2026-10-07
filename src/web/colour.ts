// Colours as WCAG weighs them, and what a Line's colour letters in on the dark basemap (#316).

/** A colour's (#rrggbb) red, green and blue, 0–255. */
const channels = (colour: string) => [1, 3, 5].map((i) => parseInt(colour.slice(i, i + 2), 16));

/** A colour's (#rrggbb) relative luminance, as WCAG works it out. */
function luminance(colour: string): number {
  const [r = 0, g = 0, b = 0] = channels(colour).map((c) => c / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Two colours' (#rrggbb) contrast ratio, by WCAG's relative luminance: 1 to 21. */
export function contrast(a: string, b: string): number {
  const [lit, dim] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((lit ?? 0) + 0.05) / ((dim ?? 0) + 0.05);
}

/**
 * What a Line's colour (#rrggbb) letters its name, rings its Scheduled Trains and colours its Trains'
 * arrows in on a dark paper: mixed with white as far as it takes for 4.5:1 against it, as WCAG asks of
 * text, for the Lines darkest in colour, such as FGC's black MM. One that reads already is as it is.
 */
export function lettering(colour: string, paper: string): string {
  for (let white = 0; white < 1; white += 0.01) {
    const mixed = `#${channels(colour)
      .map((c) => Math.round(c + (255 - c) * white).toString(16).padStart(2, '0'))
      .join('')}`;
    if (contrast(mixed, paper) >= 4.5) return white ? mixed : colour;
  }
  return '#ffffff';
}
