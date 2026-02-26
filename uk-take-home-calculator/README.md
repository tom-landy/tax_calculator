# UK Take-Home Calculator

Simple frontend app to estimate UK take-home pay from annual salary.

## Features

- Annual salary input
- UK tax code selection or custom tax code entry
- Region selection: England/Wales/N. Ireland or Scotland
- Take-home pay by day/week/month/year
- Breakdown of Income Tax, National Insurance, total deductions, and effective rate

## Run

Open `/Users/tomlandy/Desktop/Codex/uk-take-home-calculator/index.html` in a browser.

## Tax Logic (2025/26)

- Income Tax rates for UK and Scotland
- Personal Allowance with taper from £100,000 to £125,140
- Common code handling: `1257L`, `BR`, `D0`, `D1`, `NT`, `0T`, `K`, `S`/`C` prefixes
- NI estimate uses employee Class 1 category A annual thresholds and rates

## Notes

- This is an estimate for common employment cases.
- It does not currently include pension salary sacrifice, student loans, or benefits-in-kind specifics.
