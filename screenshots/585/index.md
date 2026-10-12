# #585: the links that open a new tab have `rel="noopener noreferrer"` and a word a screen reader reads

## `live/`: the merged tree, on the live CDN's data

Taken on 12 Oct 2026 at 15:47-15:48 CEST by one headless Chromium (148), in one batch of 51 s, on the dev map of origin/main 21ae2eac (the merge of PR #727, which is the tree of deploy run 38255971653, green at 15:46) on Vite 5343, with the live CDN's own files routed in: `alerts.json` as it was, and then, for the words' `lang`, with one Alert of mine more, in Spanish alone. So it is not a visit to the deployed site; the analytics beacon was blocked all the same. `live585.json` has what each page said (every link's `target`, `rel`, word, the word's `lang`, box and clip, the accessibility tree's names in the five languages, About's `scrollHeight` and `clientHeight`, the console); `live585-summary.txt` has the 35 checks, all ok. No `pageerror`; the console has only the basemap's three shield-layer filter warnings (and Chromium's GPU-stall message on the wide page).

| file | shows |
|---|---|
| `live/wide-credits.png` | the credits' strip at 1280 x 800, in Catalan: nine links, each with `rel`, `target="_blank"` and a hidden word after its text (accessible name `OpenFreeMap (s'obre en una pestanya nova)`); nothing of the word is seen |
| `live/wide-credits-hover.png`, `live/wide-credits-focus.png` | the first link hovered, and the first focused with Tab |
| `live/wide-about-top.png`, `live/wide-about-bottom.png` | About's body at its top and scrolled to its end: 12 links, the dialog 748 / 748 (`scrollHeight` / `clientHeight`), 0 scrolled by `scrollIntoView()` on its last link |
| `live/wide-about-hover.png`, `live/wide-about-focus.png` | About's source link hovered and focused |
| `live/wide-alerts.png` | a TRAM Station's board with its Alert folded open, the address after the Alert's text with its word |
| `live/phone-credits.png`, `live/phone-credits-focus.png` | the © button's text opened at 390 x 844 (3x, touch), and its first link focused |
| `live/phone-about-top.png`, `live/phone-about-bottom.png`, `live/phone-about-focus.png` | About as a sheet: the dialog 776 / 776 |
| `live/phone-alerts.png` | the board's Alert on the phone |

## `review/`: the review's first batch, origin/main b1509dae (`-before`) and the branch (`-after`), same files, one tree after the other

Taken at 15:07 CEST on 12 Oct, 1280 x 800 (`wide-`) and 390 x 844 at 3x (`phone-`), before the review's stylesheet commit (`position: relative` on the links). The pixels aren't byte-identical: the word, out of the flow, cuts the run the text is shaped in, so the kerning pair of a link's last letter and the comma after it ("C," and "B," in FGC and TMB) isn't applied and what follows sits 0.11 px otherwise: the strip 588 of 21,240 px differ at 1x, by at most 73/255 (a glyph's edge); About's body 601-652 of 288,960; the PR has the numbers. `credits`, `credits-hover`, `credits-focus`, `about-top`, `about-bottom`, `about-hover`, `about-focus` and `alerts`, each as `-before.png` and `-after.png`.

## `review-css/`: the review's second batch, with the stylesheet commit

Taken at 15:13 CEST on 12 Oct: the strip, About's top and an Alert's fold, wide and on the phone, as `-main-before.png` (origin/main b1509dae), `-fixed-after.png` (the branch at 018e8e1d, with `position: relative` on the links) and `-unfixed-after.png` (the same page with that rule overridden to `static`, the state of `review/`). Main against the branch differ as above, by glyph edges. The rule itself moves no pixel: `-fixed-after` against `-unfixed-after`, five of the six pairs are identical and the phone popover's differs by 8 px of the map under it, at most 11/255; what it takes away is the dialog's scrollable overflow (788 / 748 wide and 909 / 776 on the phone, 748 / 748 and 776 / 776 with it).
