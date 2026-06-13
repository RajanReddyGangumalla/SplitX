# AI Usage

- Tool: GitHub Copilot

## Key prompts used

- Build the Splitwise-style app server structure.
- Create the Prisma schema for users, groups, expenses, settlements, and import tracking.
- Implement auth, groups, expenses, balances, and CSV import handling.
- Build the React frontend page by page.
- Generate deployment config and documentation.

## Three times Copilot was wrong and how I fixed it

1. Copilot initially omitted the `role` field from group membership after the schema changed to time-based membership.
   - How I caught it: Step 3 required admins vs members for add/remove permissions.
   - Fix: added `GroupMember.role` back to the Prisma schema and updated group logic.

2. Copilot first kept hard-delete logic for group members in the group controller.
   - How I caught it: the updated assignment explicitly required `leftAt` to mark exits.
   - Fix: changed remove member logic to set `leftAt = now` instead of deleting the row.

3. Copilot's first CSV import pass did not have a clear group assignment path for imported rows.
   - How I caught it: the sample CSV and import requirements include row analysis and settlements, but the server still needs a concrete group target during import.
   - Fix: I kept the import endpoint focused on analysis and anomaly reporting, and documented the need to connect imports to a target group in the next implementation pass.
