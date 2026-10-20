# Immersion Tracker API

API for an immersion tracker personal project, built with NestJS, TypeScript, and MongoDB.

## Development

Install dependencies and create your local environment file from the project root:

```bash
bun install
cp .env.template .env
```

Update `.env` with your MongoDB and Auth0 configuration, and set `METRICS_TOKEN`
to a nonempty random token. The API and Prometheus use this same token to
authenticate metrics scrapes.

Start the development containers from the `containers` folder before running the API:

```bash
cd containers
docker compose --env-file ../.env up -d --wait
cd ..
```

Seed the database initially from the project root:

```bash
bun seed
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

Run database performance tests separately:

```bash
npm run test:performance
```

This command loads `.env` and requires the same dedicated `MONGODB_TEST_URL`.
Performance tests use `*.performance-spec.ts` files and are excluded from the
regular suites and `test:all`.

## Prometheus

Prometheus is available at [localhost:9090](http://localhost:9090). It scrapes the
API's `/metrics` endpoint every 15 seconds using `METRICS_TOKEN` mounted as a Compose
secret.

The scrape target in `containers/prometheus.yaml` assumes the API runs on the host
on port 3000. Update that target if you change the API port. Once the API is running,
check [Prometheus targets](http://localhost:9090/targets) for the
`immersion-tracker-api` job to be UP. It will be DOWN until the API starts.

## Grafana

Grafana starts with the development containers and is available at
[localhost:3001](http://localhost:3001). Sign in initially with username `admin`
and password `admin`, then choose a new password when prompted.

During initial setup, import the dashboard JSON files from
[`containers/grafana/dashboards`](containers/grafana/dashboards) into Grafana using
its dashboard import option. The Prometheus data source is provisioned automatically.

## Notes

### MongoDB

MongoDB must run as a replica set or sharded cluster to support transactions;
a standalone server cannot support this operation. The development Compose setup
initializes a single-node replica set automatically.
