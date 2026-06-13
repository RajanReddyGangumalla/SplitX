# Decisions

## 1. Fixed USD rate vs live exchange rate API

- Decision: Use a fixed rate of 83 INR per USD.
- Options considered: live exchange rate API, fixed rate.
- Why chosen: deterministic imports, easier review, no dependency on external services.

## 2. First-row-wins for exact duplicates vs flagging all

- Decision: Keep the first exact row and skip later identical rows.
- Options considered: flag all duplicates, skip later rows only, merge rows.
- Why chosen: the importer needs a stable source of truth and the first entry is usually the original record.

## 3. Percentage > 100% flagged vs auto-normalized

- Decision: Flag invalid percentage totals instead of normalizing them.
- Options considered: auto-scale to 100, reject row, flag row.
- Why chosen: auto-normalization can hide bad source data and create silent accounting errors.

## 4. Inactive member in split: exclude vs error

- Decision: Exclude inactive members from active group calculations and flag the row if the CSV still references them.
- Options considered: hard error, silent include, exclude and warn.
- Why chosen: time-based membership should preserve history while keeping current balances accurate.

## 5. Settlement reclassification: auto vs manual

- Decision: Auto-reclassify obvious repayment rows as settlements.
- Options considered: manual review only, auto-reclassify, reject rows.
- Why chosen: the assignment explicitly includes repayment-style rows and the sample CSV has obvious settlement language.

## 6. leftAt model vs delete-and-recreate for membership

- Decision: Use `leftAt` on `GroupMember`.
- Options considered: delete rows, soft delete flag, time range model.
- Why chosen: leaving a group should preserve history, support auditability, and avoid losing prior expense context.
