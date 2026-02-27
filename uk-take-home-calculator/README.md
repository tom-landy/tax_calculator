# UK Take-Home Calculator

Simple frontend app to estimate UK take-home pay and pension outcomes from annual salary.

## Features

- Two tabs: `Tax` and `Pension`
- UK tax code selection or custom tax code entry
- Region selection: England/Wales/N. Ireland or Scotland
- Live take-home pay by day/week/month/year
- Tax/NI breakdown on both tabs
- Pension tab:
  - Student-friendly flow: Personal info/salary, pension settings, then results
  - Early-career salary predictor by industry + UK region (with optional auto-fill)
  - Employee and employer contribution percentages
  - Enhanced employer toggle (6%)
  - Auto-enrolment qualifying earnings logic
  - Estimated pension pot at retirement
  - Weekly private pension estimate
  - Weekly income at retirement and once State Pension starts

## Run

Open `/Users/tomlandy/Desktop/Codex/uk-take-home-calculator/index.html` in a browser.

## Tax Logic (2025/26)

- Income Tax rates for UK and Scotland
- Personal Allowance with taper from £100,000 to £125,140
- Common code handling: `1257L`, `BR`, `D0`, `D1`, `NT`, `0T`, `K`, `S`/`C` prefixes
- NI estimate uses employee Class 1 category A annual thresholds and rates
- Auto-enrolment qualifying earnings band: £6,240 to £50,270
- Full new State Pension used in projection: £230.25/week

## Notes

- This is an estimate for common employment cases.
- Pension tax/NI impact currently assumes a salary sacrifice-style treatment for employee contributions.
- It does not include student loans, benefits-in-kind, or detailed provider fee modelling.
