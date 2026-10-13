# Immersion Tracker API

API for an immersion tracker personal project, built with NestJS, TypeScript, and MongoDB.

## Development

Install dependencies and create your local environment file from the project root:

```bash
bun install
cp .env.template .env
```

Update `.env` with your MongoDB and Auth0 configuration.

Start the development containers from the `containers` folder before running the API:

```bash
cd containers
docker compose up -d
cd ..
```

Start the development server with automatic reload:

```bash
bun start:dev
```

The API documentation is available at [localhost:3000/api](http://localhost:3000/api).

## Tests

The project uses Vitest for unit tests, HTTP tests, and database integration tests.
Run all suites from the project root:

```bash
bun test:all
```

HTTP tests use stubbed MongoDB providers. Database integration tests require the
MongoDB container to be running and `MONGODB_TEST_URL` in `.env` to point to a
dedicated test database, separate from development or production data.
