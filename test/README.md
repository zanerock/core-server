# Comply Server Integration Tests

This directory contains integration tests for the comply-server package. The tests verify that the server can be installed and run correctly across multiple Node.js versions, and that the standard packages integration is working properly.

## Overview

The integration test suite:
1. Builds the comply-server package locally
2. Creates a Docker container with Alpine Linux and nvm
3. Dynamically determines which Node.js versions to test based on the minimum version in package.json
4. For each Node version:
   - Installs the package
   - Starts the server
   - Runs a series of HTTP requests to verify functionality
   - Records the results

## Files

`run-integration-tests.sh` is the script that orchestrates the whole test process.

Other key files include:
- `Dockerfile` - Node.js-based container with nvm for testing across Node versions
- `docker-compose.yml` - Docker Compose configuration for the test environment
- `get-node-versions.js` - Script to determine which Node versions to test
- `test-server.js` - HTTP test suite that verifies server functionality
- `run-tests.sh` - Main test runner that executes inside the Docker container
- `test-ci.sh` - Simplified CI test that runs with current Node version only
- `test-basic.js` - Basic functionality test for package validation
- `test-integration-quick.js` - Quick integration test to verify standard packages

## Running the Tests

### Prerequisites

- Docker and Docker Compose installed (auto-starts on macOS if not running)
- Node.js installed on the host (for building the package)
- `jq` command-line tool (optional, for pretty output)

### Running Tests

#### Full Integration Tests (Multiple Node Versions)

From the project root:

```bash
# Run the full Docker-based integration tests
./test/run-integration-tests.sh
```

#### Quick Tests (Current Node Version Only)

```bash
# Run basic functionality test
node test/test-basic.js

# Run quick integration test
node test/test-integration-quick.js

# Run CI test (installs globally and tests)
./test/test-ci.sh
```

#### Direct Docker Commands

```bash
cd test
./run-integration-tests.sh
```

### Running Tests Manually

You can also run the tests step by step:

```bash
# 1. Build the package
npm pack

# 2. Build the Docker image
docker compose -f test/docker-compose.yml build

# 3. Run the tests
docker compose -f test/docker-compose.yml run --rm comply-server-test

# 4. Check results
ls test-staging/integration-results/*.json
```

## Test Coverage

The test suite verifies:

1. **Server Status** - Server responds with heartbeat endpoint
2. **Version Endpoint** - Server provides version information
3. **API Documentation** - API endpoints are properly registered
4. **Plugin System** - Plugin list endpoint works correctly
5. **Standard Packages** - All configured standard packages are automatically loaded
6. **Next Commands** - Command suggestion system works
7. **Error Handling** - Invalid endpoints return 404
8. **Content Negotiation** - Server properly handles JSON requests

### Standard Packages Integration

The tests specifically verify that the following standard packages are automatically installed and loaded:

- `@liquid-labs/liq-controls`
- `@liquid-labs/liq-credentials`
- `@liquid-labs/liq-integrations`
- `@liquid-labs/liq-integrations-issues-github`
- `@liquid-labs/liq-orgs`
- `@liquid-labs/liq-projects`
- `@liquid-labs/liq-work`
- `@liquid-labs/plugable-projects-audit`
- `@liquid-labs/plugable-server-documentation`
- `@liquid-labs/sdlc-projects-badges-coverage`
- `@liquid-labs/sdlc-projects-badges-github-workflows`
- `@liquid-labs/sdlc-projects-workflow-github-node-jest-cicd`
- `@liquid-labs/sdlc-projects-workflow-local-node-build`

## Test Results

Test results are saved to `test-staging/integration-results/` directory as JSON files, with one file per Node version tested. Each file contains:

- Node version used
- List of tests run
- Pass/fail status for each test
- Error messages for failed tests
- Summary statistics

## Troubleshooting

### Docker Build Fails

If the Docker build fails, ensure:
- Docker daemon is running
- You have sufficient disk space
- Network connectivity for downloading Alpine packages

### Tests Fail to Start

If tests fail to start:
- Check that port 32600 (default comply-server port) is not in use
- Stop any running comply-server instances: `pkill -f comply-server`
- Verify the package builds correctly with `npm pack`
- Check Docker logs: `docker compose -f test/docker-compose.yml logs`

### Node Version Issues

If certain Node versions fail:
- The script will continue testing other versions
- Check the specific error in the results JSON file
- Node.js compilation from source can take 10+ minutes per version
- For faster testing, use the quick test commands instead

### Performance Notes

- **Full Docker Tests**: Can take 30+ minutes due to Node.js compilation from source
- **Quick Tests**: Complete in under 30 seconds
- **CI Tests**: Complete in 1-2 minutes
- Consider using quick tests for development and full tests for releases

## Test Types and When to Use Them

| Test Type | Duration | Use Case | Requirements |
|-----------|----------|----------|--------------|
| `test-basic.js` | 5 seconds | Package validation, CI | Node.js only |
| `test-integration-quick.js` | 10 seconds | Standard packages verification | comply-server installed |
| `test-ci.sh` | 1-2 minutes | CI pipelines, quick integration | Node.js, npm |
| `run-integration-tests.sh` | 30+ minutes | Full cross-version testing | Docker, Docker Compose |

### Recommended Testing Strategy

1. **Development**: Use `test-basic.js` and `test-integration-quick.js`
2. **Pre-commit**: Run `test-ci.sh`
3. **Release**: Run full `run-integration-tests.sh`

## Extending the Tests

To add new tests:

1. Edit `test-server.js`
2. Add new test objects to the `tests` array
3. Each test should have a `name` and `run` function
4. The `run` function should throw an error if the test fails

Example:
```javascript
{
  name: 'My New Test',
  async run() {
    const response = await makeRequest({
      hostname: SERVER_HOST,
      port: SERVER_PORT,
      path: '/my/endpoint',
      method: 'GET'
    })
    
    if (response.statusCode !== 200) {
      throw new Error(`Expected 200, got ${response.statusCode}`)
    }
  }
}
```