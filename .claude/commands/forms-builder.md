# /forms-builder — Build Form

1. Ask: what is this form for? (contact, survey, waitlist, application, quiz)
2. Ask: how many questions? Walk through each:
   - type: text | email | select | multiselect | rating | date | file | url
   - title, required (y/n), options (if select/multiselect)
3. Ask: custom thank-you message?
4. `felix.create({ title, questions, thank_you, publish })`

Submissions: `felix.submissions(formId)` | Stats: in `form_analytics` table
