# 09. Refresh and deploy

## Intent

Keep the public site showing the latest available data every day, with nobody having to run anything, and never let a data source being down take the site down.

## Why

Live hotspots are only useful if they are today's, and new flow filings should appear without a manual release. A broken upstream source is outside the project's control, so the site has to survive one.

## What it must do

- Rebuild and publish to GitHub Pages on three triggers: every push to `main`, every day at 11:00 UTC, and on demand.
- Before building, refresh the fast sources: flows, US routes, hotspots and weather.
- Leave burned-area history alone. It takes several minutes to download and changes only yearly, so the committed copy is used.
- If the refresh fails, raise a warning and publish anyway with the data committed in the repository.
- Allow only one deployment at a time; a newer run cancels one still in progress.
- Build with a relative base path, so the site works from any GitHub Pages sub-path.
- Require the repository owner's review on every change (CODEOWNERS).

## Out of scope

- Committing refreshed data back to the repository. The daily run publishes fresh data but does not save it.
- Preview deployments for branches.
- Rendering the film. That is done by hand; see [10. Explainer film](10-explainer-film.md).

## Where it lives

- [.github/workflows/deploy.yml](../../.github/workflows/deploy.yml): the workflow
- [.github/CODEOWNERS](../../.github/CODEOWNERS): the review rule
- [vite.config.ts](../../vite.config.ts): the relative base path
