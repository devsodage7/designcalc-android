# DesignCalc — Machine Design Toolkit

A small, dependency-free web app with the calculations a mechanical engineering student or workshop engineer needs every day:

- **Cutting parameters** — spindle speed, feed rate, MRR, machining time, cutting force and power for turning, drilling and milling
- **Bearing life** — ISO 281 basic rating life (L10), reliability-adjusted life for ball and roller bearings
- **Key & shaft** — key shear and bearing stress, minimum key length, shaft torsional shear, torque from power
- **Tolerance stack-up** — worst-case and statistical (RSS) assembly tolerance, plus a contribution breakdown

No build step, no framework, no npm install. Open the file and use it.

**Live demo:** https://devsodage7.github.io/designcalc/

## Why

Workshop and design work needs a fast answer, not a spreadsheet. This tool runs offline on any laptop or phone browser, and every formula is covered by an automated test page so the numbers can be trusted.

## Run locally

Option 1 — just open `index.html` in a browser.

Option 2 — serve it (recommended, keeps `file://` restrictions away):

```bash
python -m http.server 8000
# then open http://localhost:8000
```

## Verify the formulas

Open `tests.html` in the same way. It runs 13 checks against hand-computed reference values and shows pass/fail per test.

```
http://localhost:8000/tests.html
```

## Formulas used

### Cutting

| Quantity | Formula |
| --- | --- |
| Spindle speed | `N = 1000 · Vc / (π · D)` |
| Turning feed rate | `vf = f · N` |
| Turning MRR | `MRR = 1000 · Vc · f · ap` |
| Turning time | `t = L / vf` |
| Cutting force | `Fc = kc · ap · f` |
| Cutting power | `Pc = Fc · Vc / 60` |
| Drilling MRR | `MRR = (π D² / 4) · f · N` |
| Drilling time | `t = (L + 0.3 D) / vf` |
| Milling feed rate | `vf = fz · z · N` |
| Milling MRR | `MRR = ap · ae · vf` |

`Vc` in m/min, `D` in mm, `f` in mm/rev, `fz` in mm/tooth, `kc` in N/mm².

### Bearing life (ISO 281)

```
L10 = (C / P)^p · 10^6 revolutions
L10h = L10 / (60 · n)
```

`p = 3` for ball bearings, `p = 10/3` for roller bearings. Reliability adjustment uses the ISO 281 `a1` factor (`Lnm = a1 · L10`):

| Reliability | 90% | 95% | 96% | 97% | 98% | 99% |
| --- | --- | --- | --- | --- | --- | --- |
| `a1` | 1.00 | 0.62 | 0.53 | 0.44 | 0.33 | 0.21 |

### Key and shaft

```
F  = 2T / d                 (T in N·m, d in mm)
τ  = F / (w · L)            key shear
σ  = F / ((h/2) · L)        key bearing
τs = 16T / (π d³)           shaft torsion
T  = 9550 · kW / rpm
```

### Tolerance stack-up

For dimensions with symmetric tolerances `±t`:

```
worst case = Σ nominal ± Σ t
RSS        = Σ nominal ± √(Σ t²)
```

The RSS result assumes independent, normally distributed errors. Use it for process capability studies, not as a guaranteed limit.

## Project structure

```
designcalc/
├── index.html        UI (four tabs)
├── tests.html        formula tests, run in the browser
└── assets/
    ├── calc.js       pure calculation functions (no DOM)
    ├── app.js        UI wiring and rendering
    └── styles.css    dark, responsive theme
```

`calc.js` has no DOM dependency, so the same functions can be reused in a Node script or a spreadsheet export later.

## Notes and limits

- Cutting power assumes a sharp tool, full depth of cut and the `kc` value you enter. Real values depend on material, rake angle and wear.
- Bearing life assumes correct mounting, clean lubrication and normal operating temperature.
- Tolerance stack-up is one-dimensional. For 2D/3D chains, use a dedicated stack-up analysis.
- These are engineering aids, not a substitute for the relevant design code or a qualified engineer's review.

## License

MIT — see [LICENSE](LICENSE).

Built by [Devraj Arun Sodage](https://github.com/devsodage7).
