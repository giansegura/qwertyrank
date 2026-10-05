@AGENTS.md

## Commits

Todos los commits siguen [Conventional Commits](https://www.conventionalcommits.org/): `<tipo>(<ámbito opcional>): <descripción>`.

- Tipos: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `style`, `build`, `ci`, `chore`, `revert`.
- Descripción en imperativo, en minúscula y sin punto final. Ejemplo: `feat(ranked): validate games on the server`.
- Un cambio incompatible lleva `!` tras el tipo (`feat!: …`) o un pie `BREAKING CHANGE: …`.
- Las PR solo se integran con squash y el título de la PR pasa a ser el commit en `main`: el título también sigue Conventional Commits.
