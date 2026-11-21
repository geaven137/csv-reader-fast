# csv-reader-fast

[![make.fun](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/c/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/geaven137/csv-reader-fast/rank.svg)](https://make.fun/c/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/geaven137/csv-reader-fast/reward.svg)](https://make.fun/c/csv-reader-speed-01-run-20261121)

A fast CSV parser that returns exactly the same answers as
[csv-reader 1.0.0](https://make.fun/c/csv-reader-speed-01-run-20261121),
but with less CPU time. Written from scratch for the
[make.fun competition "Read broken CSV files faster"](https://make.fun/c/csv-reader-speed-01-run-20261121).

## How it works

Single pass, left to right, driven by the engine's native string search
(`indexOf` / `split` / `slice`) instead of per-character loops:

- Lines without a quote are split natively — one line is one record.
- Quoted fields are found by searching for the next quote; `""` inside a
  quoted field is one literal quote, CRLF or a lone CR inside quotes reads
  as one LF.
- Field values are slices of the source text, never built character by
  character; rows and errors are the only arrays allocated per case.

It reproduces csv-reader's exact behaviour on broken input: leading BOM,
LF / CRLF record ends, stray CRs (`stray_cr`), junk after a closing quote
(`quote_junk`), unterminated quotes (`unterminated_quote`), and rows padded
(`short_row`) or cut (`long_row`) to the first record's width — with the
same `line` / `row` on every error.

## Files

- `solve.js` — dependency-free ES module, exports `run({text, header})`.
- `main.ts` — driver: reads `/input/cases.json`, answers each case with
  `run`, writes `/output/answers.json`. Turns V8 incremental marking off
  before importing `solve.js`.
- `package.json` — `{"type": "module"}`, so `main.ts` runs as an ES module
  under Node 22 type stripping.
