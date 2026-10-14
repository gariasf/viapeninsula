// Colours as WCAG weighs them: what a Line's colour letters in on a dark paper or a light one, and whether dark ink or white letters on it (#316, #321, #465).

/** A colour's (#rrggbb, or #rgb, which is #rrggbb with each digit twice) red, green and blue, 0–255. */
const channels = (colour: string) => {
  const long = colour.replace(/^#(.)(.)(.)$/, '#$1$1$2$2$3$3');
  return [1, 3, 5].map((i) => parseInt(long.slice(i, i + 2), 16));
};

/** A colour's (#rrggbb or #rgb) relative luminance, as WCAG works it out. */
function luminance(colour: string): number {
  const [r = 0, g = 0, b = 0] = channels(colour).map((c) => c / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Two colours' (#rrggbb or #rgb) contrast ratio, by WCAG's relative luminance: 1 to 21. */
export function contrast(a: string, b: string): number {
  const [lit, dim] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((lit ?? 0) + 0.05) / ((dim ?? 0) + 0.05);
}

/**
 * What a Line's colour (#rrggbb or #rgb) letters its name, rings its Scheduled Trains and colours its Trains'
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

/** The dark lettering for a Line's colour that white doesn't read on. */
export const INK = '#111';

/** Whether INK reads better on a colour than white does, by WCAG's contrast ratio. */
export function darkInk(colour: string): boolean {
  return contrast(colour, INK) > contrast(colour, '#ffffff');
}

/**
 * Colours the dark basemap's paper (#0c0c0c) swallows, by Network: Media Distancia y Avant's black is drawn there in a
 * light grey, its Lines and its Trains, and stays black on the light basemap (#263, the
 * maintainer's pick of 14 Oct 2026). #D0D0D0 reads at 12.7:1 on the paper and 6.9:1 on the Lines' casing, and is
 * ΔE 10.5 from the nearest Line's colour, FGC's R6 (#b3b3b3), and 28 from Madrid's C8 (#868584): #B0B0B0 was ΔE 1.1 from R6.
 * Its track below zoom 7 is DARK_TRACK_STAND_INS' mid grey instead (#781). FGC's MM, black too, keeps its colour and casing, as before.
 */
export const DARK_STAND_INS: Record<string, string> = { 'media-distancia-avant': '#D0D0D0' };

/**
 * The Networks' tracks below zoom 7 on the dark basemap, where their Lines' stand-in (DARK_STAND_INS) won't do: Media
 * Distancia y Avant's in a mid grey, which sits under AVE y Larga Distancia's magenta there, as its black does on the
 * light basemap, rather than the brightest stroke on the map (#781, the maintainer's pick of 14 Oct 2026). #707070 reads
 * at 4.0:1 on the paper (#0c0c0c), under Ouigo's pink (4.3:1), and at 2.3:1 on the basemap's roads (#3a3a3a), which
 * #555555 was too near (1.5:1); AVE y Larga Distancia's #81005E is 2.0:1, but stands out by its colour.
 */
export const DARK_TRACK_STAND_INS: Record<string, string> = { 'media-distancia-avant': '#707070' };

/** A file's Networks and Lines with their stand-ins on the dark basemap (DARK_STAND_INS), in place, as it comes. */
export function standIn<T>(file: T): T {
  const { networks, lines } = file as { networks?: { id: string; colour: string }[]; lines?: { network: string; colour: string }[] };
  for (const n of networks ?? []) n.colour = DARK_TRACK_STAND_INS[n.id] ?? DARK_STAND_INS[n.id] ?? n.colour;
  for (const l of lines ?? []) l.colour = DARK_STAND_INS[l.network] ?? l.colour;
  return file;
}
