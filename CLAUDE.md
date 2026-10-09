@AGENTS.md

## Commits

All commits follow [Conventional Commits](https://www.conventionalcommits.org/): `<type>(<optional scope>): <description>`.

- Types: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `style`, `build`, `ci`, `chore`, `revert`.
- Description in the imperative, lowercase and with no trailing period. Example: `feat(ranked): validate games on the server`.
- A breaking change has `!` after the type (`feat!: …`) or a `BREAKING CHANGE: …` footer.
- PRs are only merged with squash and the PR title becomes the commit on `main`: the title follows Conventional Commits too.

## Language

English is the project's official language. Code, comments, test names, log and error messages, docs, commits and PRs are written in English. Only the content users see in another locale is in that language: `messages/es.json`, `messages/pt.json`, the per-locale legal pages and the word lists.
