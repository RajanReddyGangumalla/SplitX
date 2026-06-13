# Scope

## 1. CSV anomalies found in the sample file

| Row | Problem | Action Taken | Reasoning |
| --- | --- | --- | --- |
| 5 | DUPLICATE_EXACT | Skipped | Same description, date, and amount as the earlier Marina Bites row. |
| 6 | AMOUNT_FORMAT | Imported | Amount had a comma and was normalized to 1200. |
| 8 | PAID_BY_CASE | Imported | `priya` was normalized to canonical `Priya`. |
| 10 | PAID_BY_AMBIGUOUS | Flagged | `Priya S` is only a partial match and not safe to auto-resolve. |
| 12 | PAID_BY_MISSING | Skipped | No payer was provided, so the row cannot be trusted. |
| 13 | SETTLEMENT_ROW | Reclassified | Description indicates a repayment, so it should become a settlement. |
| 14 | PERCENTAGE_INVALID | Flagged | Percentages do not add up to 100. |
| 18 | DUPLICATE_CONFLICT | Flagged | Same event pattern as the earlier Thalassa dinner, but the payer and amount differ. |
| 20 | CURRENCY_USD | Converted | USD amount was converted to INR using the fixed rate of 83. |
| 21 | CURRENCY_USD | Converted | USD amount was converted to INR using the fixed rate of 83. |
| 23 | UNKNOWN_MEMBER_IN_SPLIT | Flagged | `Kabir` is not in the known user list and must be excluded. |
| 24 | DUPLICATE_CONFLICT | Flagged | Same Goa parasailing event as the earlier row, but negative refund logic makes it unsafe to import as a normal expense. |
| 25 | NEGATIVE_AMOUNT | Flagged | Refund rows with negative values should not be imported as normal expenses. |
| 26 | PAID_BY_CASE | Imported | `rohan ` was normalized to canonical `Rohan`. |
| 27 | CURRENCY_MISSING | Imported | Currency defaulted to INR because the field was empty. |
| 32 | SPLIT_TYPE_MISMATCH | Flagged | The row says `equal` but the notes include custom share values, so the row needs review. |
| 34 | INACTIVE_MEMBER_IN_SPLIT | Flagged | Meera had already moved out, so the split should not include her as an active member. |

## 2. Database schema description

- `User`: application user with unique `name`, unique `email`, password hash, and creation timestamp.
- `Group`: expense group container with name and creation timestamp.
- `GroupMember`: time-based membership with `joinedAt`, optional `leftAt`, and `role`.
- `Expense`: normalized expense record with INR amount, optional original currency metadata, split type, expense date, and optional imported CSV row reference.
- `ExpenseSplit`: final INR owed amount for each user on each expense.
- `Settlement`: repayment record between payer and payee inside a group.
- `ImportLog`: summary record for each CSV import run.
- `ImportAnomaly`: row-level anomaly tracker for audit and review.

## 3. Time-based membership model

Membership is never hard-deleted. A user joins a group when a `GroupMember` row is created, and leaves when `leftAt` is set. This keeps history intact and makes it possible to answer questions like:

- Who was active at the time of an expense?
- Did a user leave before a split was created?
- Should a user appear in current group balances?

Active membership means `leftAt IS NULL`.

## 4. USD conversion approach

USD rows are converted using a fixed exchange rate of 83 INR per 1 USD.

Why fixed rate instead of a live rate API:

- The internship assignment needs deterministic outputs.
- CSV imports should not depend on external service uptime.
- A fixed rate makes review and manual verification easier.
- The source data is messy, so a stable conversion rule is safer than a moving target.
