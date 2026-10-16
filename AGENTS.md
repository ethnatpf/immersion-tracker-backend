# Project guidance

## Stack and conventions

- This is a NestJS backend using TypeScript, Express, Mongoose, and Vitest.
- Feature modules live under `src/modules/`. Keep HTTP handling in controllers,
  business logic and persistence in services, request validation in DTOs, and
  database definitions in schemas.
- The project uses ESM with NodeNext resolution. Use `.js` extensions in local
  TypeScript imports, following existing code. `~/*` maps to `src/*`.
- Document every endpoint's response with DTO classes and Swagger response
  decorators; use a no-content decorator for responses without a body.
- Never expose Mongoose's `__v` in API responses or response DTOs.
- Preserve existing user changes and keep work focused on the requested behavior.
  Do not expand unfinished features merely because a service or controller stub
  exists.

## TDD workflow

- Use test-driven development for new behavior and bug fixes: write or update a
  meaningful test, run it and confirm it fails for the intended reason, implement
  the smallest change that makes it pass, then refactor while keeping it green.
- Test observable behavior rather than private methods or implementation details.
  Use HTTP tests for routing, validation, and authentication; service tests for
  business logic; database integration tests for actual persistence behavior.
- Work in small increments. Run the focused tests during development and the
  relevant suites and checks before finishing. Documentation-only changes do not
  need new tests.
- Do not weaken assertions or bypass authentication to make a failing test pass.

## Authentication and current user

- Global validation and authentication are registered by `configureApp()` in
  `src/configure-app.ts`. Use that shared setup when creating HTTP test apps.
- Protected endpoints must continue to run the real `AuthorizationGuard`.
  Production trusts the configured Auth0 issuer and audience using RS256.
- In controllers, use `@CurrentUserId() userId: string` from
  `src/decorators/current-user-id.decorator.ts` to obtain the verified JWT subject.
  Pass this identity explicitly to services that need it.
- This ID is the external provider's subject string, not a MongoDB ObjectId. Do
  not trust an owner/user ID supplied in a request body, query, or path as the
  authenticated identity. Scope user-owned reads and writes to the authenticated
  user where applicable.

## HTTP test coverage

- Whenever adding a protected endpoint, add its HTTP method and concrete path to
  `protectedRoutes` in `test/protected-routes.http-spec.ts`. Update entries when
  endpoints are renamed or removed. Include each method separately and substitute
  concrete values for path parameters.
- Keep detailed JWT verification cases in `test/authorization.http-spec.ts`;
  do not duplicate expiration, issuer, audience, and signature cases for every
  endpoint. Add normal authenticated behavior tests for new routes separately.
- Reuse `createAuthFixture()` from `test/helpers/auth.fixture.ts` for signed
  tokens and verifier options. It generates test RSA keys in memory; no real
  Auth0 tokens, private keys on disk, or Auth0 network access are needed.
- Reuse `createTestApp()` from `test/helpers/create-test-app.ts` for full-app HTTP
  tests. It imports `AppModule`, stubs MongoDB providers, and applies the shared
  application setup with explicit test authentication configuration. Extend its
  provider stubs when adding new models or external dependencies.
- Keep test keys and trusted issuer overrides exclusive to test setup. Do not
  add production authentication bypasses or fallbacks to test credentials.

## Commands and verification

- `npx vitest run` runs unit tests (`*.spec.ts`).
- `npm run test:http` runs HTTP suites (`*.http-spec.ts`) without a live database.
- `npm run test:integration` runs database suites (`*.integration-spec.ts`) and
  loads `.env`. It requires a reachable, dedicated test database configured through
  `MONGODB_TEST_URL`; never point it at production. Clean up test-created records.
- `npm run test:all` runs unit, HTTP, and database integration suites.
- Reserve `*.e2e-spec.ts` for future complete HTTP-to-database tests. No e2e
  suite or runner is configured yet.
- `npx tsc --noEmit --incremental false` checks types without updating build caches.
- `npm run lint` runs the repository lint checks. Report existing unrelated
  warnings separately from issues introduced by the change.
- `npm run build` compiles the application. `npm run start:dev` starts watch mode.
- Do not commit secrets from `.env` or generated build/cache artifacts. Document
  new required environment variables in `.env.template` using safe examples.
