# Purging the backend from this repo's git history

The backend now lives in its own private repository, and `backend/` has been deleted
from the working tree. **That does not make it private.** This repo is public and every
backend file is still readable at any of the 8 commits that touched it:

```bash
git log --oneline -- backend/          # the commits
git show <sha>:backend/GUILD-API.md    # still readable by anyone, forever
```

GitHub also keeps unreferenced commits reachable via the API for a while after a
force-push, and forks/clones made before the rewrite keep everything regardless.

**This is a deliberate, disruptive operation and I have not run it.** Rewriting
published history breaks every existing clone. Decide whether it is worth it, then
follow this exactly.

---

## 0. Decide whether you actually need this

You need it if the point of making the backend private is that its contents were never
meant to be public. In this repo that means, in rough order of sensitivity:

| What | Why it might matter |
|---|---|
| `backend/GUILD-API.md` | Reverse-engineering notes on NetEase's private gateway: endpoints, the bearer scheme, which routes are gated, a reproducible probe harness. The most sensitive document in the split. |
| `backend/src/**` schema + auth | The gated-data model and the trust boundary's implementation. |
| `backend/src/Wwm.Api/Services/OpponentGuildSeed.cs` | 58 guild ids. Public-ish (wwmdb shows them) but a tidy aggregated list. |

You **do not** need it for the `WWMDB_TOKEN` default. That value has been in
`frontend/scripts/*.js` in this public repo since long before the backend existed, it is
still there now, and those scripts are still live. **Rotating it is the only fix, and it
is worth doing regardless of whether you rewrite history** — see step 5.

If you skip the rewrite: nothing breaks, and the backend is private *going forward*.
That is a legitimate choice. Note it and move on.

---

## 1. Prerequisites

`git filter-repo` is the supported tool (`filter-branch` is deprecated and slow, and
gets the tag/ref handling wrong). It is not installed here:

```bash
pip install git-filter-repo
# or: winget install --id GitHub.git-filter-repo   /   scoop install git-filter-repo
git filter-repo --version
```

Tell your collaborators to stop pushing before you start.

## 2. Take a backup you can actually restore from

Not optional. A mirror clone keeps every ref, so a bad rewrite is recoverable:

```bash
cd /e/Projects/Non-Work
git clone --mirror https://github.com/gamevn4rum/wwm.git wwm-backup.git
```

Keep it until you are satisfied with the result — days, not minutes.

## 3. Rewrite

Work on a **fresh clone**, never your working checkout: `filter-repo` refuses to run on
a repo with a remote unless it is a fresh clone, precisely to stop accidents.

```bash
cd /e/Projects/Non-Work
git clone https://github.com/gamevn4rum/wwm.git wwm-rewrite
cd wwm-rewrite

git filter-repo --invert-paths \
  --path backend \
  --path data-migration.html \
  --path .github/workflows/backend.yml \
  --path frontend/data \
  --path frontend/scripts/fetch-data.js \
  --path frontend/scripts/encrypt-data.js \
  --path frontend/scripts/decrypt-data.js \
  --path frontend/scripts/fetch-guild.js \
  --path frontend/scripts/fetch-guild-rank.js \
  --path frontend/scripts/fetch-hall-of-fame.js \
  --path frontend/scripts/fetch-live-stats.js \
  --path frontend/scripts/fetch-opponent-guilds.js \
  --path frontend/scripts/fetch-player-stats.js \
  --path frontend/scripts/backfill-match-ids.js \
  --path frontend/scripts/apps-script-gateway.gs
```

The `frontend/` paths were added when the static data path was removed (2026-07-30).
`frontend/data/` held the roster, match history and player stats — the `.enc` files plus
the plaintext JSON — and the scripts held the `WWMDB_TOKEN` default and the sheet/relay
protocol details.

> **Archive before you purge.** Those payloads were the *only* surviving copy of the
> wwmdb-derived data once wwmdb stopped resolving. They are archived in the backend repo's
> `backfill-data/` (including `player-stats.raw-2026-07-30.json`, which is the sole record
> of three departed members' stats). Confirm that is committed there before rewriting, or
> the data is gone for good.

Verify the history is clean before pushing anything:

```bash
git log --oneline --all -- backend/ frontend/data/   # must print nothing
git rev-list --all --count                           # sanity: commit count barely moves
git log --oneline -5                                 # sanity: recent frontend work intact

# and prove the payloads are unreachable, not merely unlisted:
git rev-list --all --objects | grep -E 'frontend/data/|\.enc$'   # must print nothing
```

`filter-repo` drops the `origin` remote on purpose. Re-add and force-push all refs:

```bash
git remote add origin https://github.com/gamevn4rum/wwm.git
git push --force --all origin
git push --force --tags origin
```

## 4. Deal with the fallout

- **Every collaborator must re-clone.** A `git pull` on an old clone will try to merge
  the pre-rewrite history straight back in, undoing the whole exercise. Say this
  explicitly; do not assume they'll rebase correctly.
- **`gh-pages` needs no rewrite, but it does need a redeploy.** `deploy.yml` rebuilds it as
  a fresh *orphan* commit and force-pushes, so it is always a one-commit snapshot with no
  shared history — there is nothing to filter. What matters is that the **currently
  published** commit still contains the old bundle, and that bundle carries both the
  `data/*.enc` payloads and the real `DATA_ENCRYPTION_KEY` baked in. Any deploy after the
  static path was removed replaces it wholesale. Confirm with:

  ```bash
  git fetch origin gh-pages
  git grep -c 'dataEncryptionKey:"' origin/gh-pages -- '*.js'   # expect no match
  git ls-tree -r --name-only origin/gh-pages | grep -c '\.enc$'  # expect 0
  ```
- **Ask GitHub Support to garbage-collect unreachable objects.** Until they do, the old
  commits stay reachable by SHA through the API — a force-push alone does not remove
  them. This is the step people forget.
- **Forks and existing clones keep everything.** If the repo has forks, treat the
  content as public regardless of what you do here.
- Your local `E:\Projects\Non-Work\WWMSheet` checkout is now also stale. Re-clone it, or
  accept that its history differs from the remote's.

## 5. Rotate what was exposed — do this whether or not you rewrite

Rewriting history does not un-leak anything already fetched. Credentials that have sat
in a public repo are burned:

- [ ] **`WWMDB_TOKEN`** — hardcoded as a default in `frontend/scripts/*.js` (still live
      in this repo) and in the backend's `Wwm.Sync/Program.cs`. Rotate it and set the new
      value as a Function App application setting; leave the default as an obviously-dead
      placeholder.
- [ ] **`GOOGLE_SERVICE_ACCOUNT_JSON`** — an Actions secret, so not exposed by this, but
      if it was ever pasted into a file or a log, rotate the key in Google Cloud.
- [ ] **`DATA_ENCRYPTION_KEY`** — the AES key the static path shipped to the browser. Public
      by design (that was `SECURITY.md`'s core limitation) and there is nothing to rotate
      *to*: the static path is gone, so no code reads it. **Delete the Actions secret** —
      it now only creates the impression of a protection that no longer exists. Anything it
      ever encrypted must be treated as having been public the whole time.
- [ ] **`ADMIN_KEY` / `JWT_SIGNING_KEY`** — never committed; generate fresh values when
      you provision Azure and keep them in App Service configuration only.

## 6. Prevent the next one

- [ ] Enable **push protection / secret scanning** on both repos (Settings → Code
      security). It is free on public repos and catches the pasted-credential case.
- [ ] The private repo's `.gitignore` already excludes `local.settings.json` and
      `appsettings.Development.json`, which are where connection strings and `ADMIN_KEY`
      naturally end up. Keep it that way.
- [ ] Private is not a security boundary — it is one setting and a collaborator list.
      Keep treating secrets as secrets there.
