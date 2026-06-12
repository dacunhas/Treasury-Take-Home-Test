# Sample test labels

Five sample alcohol-beverage labels for exercising the verifier end-to-end (BUILD
backlog **T3.4**). They are **synthetic** — generated deterministically by
[`generate_samples.py`](./generate_samples.py) (Pillow only), not photographs of
real products — so they are reproducible and safe to commit. Re-generate with:

```bash
python3 samples/generate_samples.py
```

[`EXPECTED.csv`](./EXPECTED.csv) lists the expected COLA values for each label plus
the overall verdict it should drive. It doubles as a ready-made fixture for batch
mode (M4).

| # | File | Beverage | What it exercises | Expected overall |
|---|------|----------|-------------------|------------------|
| 1 | `01-old-tom-bourbon-compliant.png` | Spirits | Baseline clean label — the CONTEXT §5 sample (Old Tom Distillery, Kentucky Straight Bourbon, 45% Alc./Vol. (90 Proof), 750 mL), canonical Government Warning. | **Pass** |
| 2 | `02-old-tom-bourbon-bad-warning.png` | Spirits | Non-compliant warning: title-case `Government Warning:` prefix (not ALL CAPS) **and** reworded/shortened clauses. Drives the strict warning check + word diff. | **Fail** |
| 3 | `03-cascade-summit-pale-ale-beer-no-abv.png` | Beer | Malt beverage with **no ABV statement** (optional for beer) — must NOT be failed for the missing percentage. | **Pass** |
| 4 | `04-stones-throw-table-wine.png` | Wine | Brand printed `STONE'S THROW` (all caps) vs expected `Stone's Throw` → tolerant brand **review** (the Dave case); `Table Wine` stated in lieu of a numeric ABV (7–14% class) → ABV not "missing". | **Review** |
| 5 | `05-old-tom-bourbon-angled-glare.png` | Spirits | Same data as #1 but **tilted, glared, and slightly blurred** (Jenny's bad-photo case). The vision model handles it; a low-confidence read escalates to the deep tier. | **Pass** |


> **Note on label 4 (Table Wine):** the *overall* verdict is **Needs review**
> driven by the tolerant brand match (`STONE'S THROW` vs `Stone's Throw`). Whether
> the ABV row reads *Table-Wine match* vs *missing/review* depends on the extractor
> surfacing "Table Wine" into the ABV field; either way the wine is **not failed**
> for omitting a numeric percentage, and the overall verdict is unaffected.

## How to demo

1. `npm run dev` and open http://localhost:3000.
2. Pick a row from the table above. Type its **brand**, **class/type**, **ABV**, and
   **net contents** into the form and choose the matching **beverage type**.
3. Upload the corresponding PNG from this folder and submit.
4. Confirm the per-field verdict and overall banner match the **Expected overall**
   column (e.g. label 2 fails on the Government Warning with a visible word diff;
   label 4 shows the brand as *Needs review*, not a hard fail).

> The tool **flags discrepancies for a human reviewer** — it does not make the
> compliance decision. "Needs review" is a feature, not an error.
