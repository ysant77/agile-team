# Privacy policy

Last updated: 24 November 2026. This page applies to the Forge app "agile-team" (panel name
"Agile team verifier") for Jira. The app is a hackathon project. It is given as it is, with no
commercial service behind it.

## What the app stores

The app stores its data in the Forge storage of your own Atlassian site. Data of one site is
never shared with a different site.

- **An audit record of actions.** Each record holds the Atlassian account id of the person who
  acted (the person who made a claim, recorded acceptance criteria, linked a pull request, gave an
  approval or a sign-off, or created a work item), the time, and the work item key.
- **Work data.** Acceptance criteria and their checks, verdicts and their reasons, links to pull
  requests, approvals and sign-offs, and the progress of a claim.
- **Investigation data, when a user asks the app to look into a symptom.** The symptom text that
  the user typed, the hypothesis, the cited file lines, and the account id of that user.
- **Drafts of work items** that wait for the user's confirmation, for at most 30 minutes.
- **Issue properties** on the work item: the stored acceptance criteria, the verdicts and the
  sign-off.

The app does not store names, email addresses or passwords. An Atlassian account id is personal
data, so this app stores personal data.

## How long

The stored data has no expiry date today. It is removed when the app is uninstalled from the site.

## What leaves your site

- The app reads from the GitHub API (`api.github.com`) for the one repository that the site's
  administrator configured: pull requests, commits, check runs and CI reports. These are read
  requests only.
- The app sends no Jira content, no account id and no symptom text to GitHub.
- The app's own code calls no AI model. The Rovo agents that come with the app use the model of
  the Atlassian platform, under Atlassian's own terms.
- The app sends data to no other service.

## Who can see what

- A verdict, its reasons and the audit record of a work item are visible to people who can browse
  that work item in Jira.
- An investigation finding is visible to the user who made it, and to people who can browse a work
  item that was created from it.

## Your choices

- A site administrator can uninstall the app at any time. This removes the stored data.
- To ask a question or to ask for removal of data, open an issue at
  https://github.com/ysant77/agile-team/issues. Do not put personal data in a public issue.

## Changes

A change of this page is made through a pull request in this repository, so its history is public.
