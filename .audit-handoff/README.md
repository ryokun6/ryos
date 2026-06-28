# Apple glossary audit handoff

These reports are the complete final outputs from the Composer 2.5 audit
subagents. Each cloud fix agent must:

1. Read its locale report in full before editing.
2. Apply all high-confidence, context-correct fixes.
3. Do not apply findings explicitly classified as context collisions, false
   positives, intentional product names, or review-only.
4. Preserve interpolation placeholders and locale-specific CLDR plural forms.
5. Update the curated terminology data or contextual overrides when a recurring
   term should remain enforced.
6. Run the targeted translation audit, locale/key parity checks, TypeScript,
   and relevant unit tests.
7. Delete the entire `.audit-handoff` directory before the final commit so it
   does not appear in the resulting pull request diff.

Agents should commit and push their changes on their cloud branch and return the
branch name, commit, tests, and a short summary of intentionally skipped
collisions.
