// Colours as WCAG weighs them, and what a Line's colour letters in on a dark paper or a light one (#316, #321).

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
 * arrows in on a paper: on a dark one, as the dark basemap and cards, mixed with white as far as it
 * takes for 4.5:1 against it, as WCAG asks of text, for the Lines darkest in colour, such as FGC's
 * black MM; on a light one, as the light cards, mixed with black, for the lightest, such as R2N's
 * yellow (#321). One that reads already is as it is.
 */
export function lettering(colour: string, paper: string): string {
  // White or black, whichever stands out more on the paper.
  const towards = contrast(paper, '#ffffff') > contrast(paper, '#000000') ? 255 : 0;
  for (let mix = 0; mix < 1; mix += 0.01) {
    const mixed = `#${channels(colour)
      .map((c) => Math.round(c + (towards - c) * mix).toString(16).padStart(2, '0'))
      .join('')}`;
    if (contrast(mixed, paper) >= 4.5) return mix ? mixed : colour;
  }
  return towards ? '#ffffff' : '#000000';
}
