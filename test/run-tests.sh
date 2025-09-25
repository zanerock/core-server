#!/bin/bash

set -e

echo "=================================================="
echo "Comply Server Integration Tests"
echo "=================================================="

# Source nvm - handle both container and host paths
if [ -f "$NVM_DIR/nvm.sh" ]; then
    source $NVM_DIR/nvm.sh
elif [ -f "/home/testuser/.nvm/nvm.sh" ]; then
    export NVM_DIR="/home/testuser/.nvm"
    source $NVM_DIR/nvm.sh
else
    echo "Error: Could not find nvm.sh"
    exit 1
fi

# Using pre-built package from mounted volume
echo "Using pre-built package from host..."
cd /project

# Make test scripts executable (in case mount lost permissions)
chmod +x /project/test/*.sh 2>/dev/null || true

# Verify that we have the built files
echo "Verifying pre-built files..."
ls -la dist/ node_modules/ > /dev/null
echo "✓ Found dist/ and node_modules/ directories"

# Extract binary information from package.json
echo "Extracting binary information from package.json..."
BINARY_NAME=$(node -e "const pkg = require('./package.json'); const bins = Object.keys(pkg.bin || {}); console.log(bins[0] || '')")
if [ -z "$BINARY_NAME" ]; then
    echo "Error: No binary defined in package.json"
    exit 1
fi
BINARY_PATH=$(node -e "const pkg = require('./package.json'); console.log(pkg.bin['$BINARY_NAME'] || '')")
if [ -z "$BINARY_PATH" ]; then
    echo "Error: No binary path found for $BINARY_NAME"
    exit 1
fi
echo "Package binary: $BINARY_NAME -> $BINARY_PATH"

# Verify the binary exists
echo "Debug: Looking for binary at /project/$BINARY_PATH"
ls -la /project/dist/ || echo "No dist directory found"
if [ ! -f "/project/$BINARY_PATH" ]; then
    echo "Error: Binary not found at $BINARY_PATH"
    echo "Contents of /project:"
    ls -la /project/
    exit 1
fi

# Check if Node is already available (from base image)
if command -v node &> /dev/null; then
    echo "Using pre-installed Node $(node --version) for setup"
else
    # Install a default Node version if not available
    echo "Installing initial Node version for setup..."
    nvm install 18
    nvm use 18
fi

# Get test versions from the Node.js script
echo "Determining Node versions to test..."
cd /project
node test/get-node-versions.js > /tmp/versions.json
cat /tmp/versions.json

# Parse the test versions or use single version if specified
if [ -n "$TEST_SINGLE_VERSION" ]; then
    TEST_VERSIONS="$TEST_SINGLE_VERSION"
    echo "Testing with single Node version: $TEST_SINGLE_VERSION (set via TEST_SINGLE_VERSION)"
else
    TEST_VERSIONS=$(node -e "const v = require('/tmp/versions.json'); console.log(v.testVersions.join(' '))")
    echo "Will test with Node versions: $TEST_VERSIONS"
fi

echo ""

# Track overall test results
OVERALL_PASSED=0
OVERALL_FAILED=0
FAILED_VERSIONS=""

# Test each Node version
for NODE_VERSION in $TEST_VERSIONS; do
    echo ""
    echo "=================================================="
    echo "Testing with Node v$NODE_VERSION"
    echo "=================================================="
    
    # Check if Node version is already installed, only install if missing
    if nvm ls $NODE_VERSION &>/dev/null; then
        echo "Using pre-installed Node v$NODE_VERSION"
    else
        echo "Node v$NODE_VERSION not found, installing..."
        nvm install $NODE_VERSION || {
            echo "Warning: Could not install Node v$NODE_VERSION, skipping..."
            continue
        }
    fi
    
    # Use the installed version
    nvm use $NODE_VERSION
    node --version
    npm --version
    
    # Set up test environment
    echo "Setting up test environment..."
    cd /project
    
    # Create a symlink to make the binary available
    mkdir -p /tmp/test-bin
    rm -f /tmp/test-bin/$BINARY_NAME
    ln -s /project/$BINARY_PATH /tmp/test-bin/$BINARY_NAME
    chmod +x /tmp/test-bin/$BINARY_NAME
    
    # Make binary available in PATH for testing
    export PATH="/tmp/test-bin:$PATH"
    
    # Ensure test results directory exists
    mkdir -p /project/test-staging/integration-results
    
    # Run the test suite
    echo "Running test suite..."
    if node /project/test/test-server.js; then
        echo "✓ Tests PASSED for Node v$NODE_VERSION"
        OVERALL_PASSED=$((OVERALL_PASSED + 1))
    else
        echo "✗ Tests FAILED for Node v$NODE_VERSION"
        OVERALL_FAILED=$((OVERALL_FAILED + 1))
        FAILED_VERSIONS="$FAILED_VERSIONS $NODE_VERSION"
    fi
    
    # Clean up for next iteration
    cd /project
    pkill -f $BINARY_NAME || true
    sleep 2
done

# Final summary
echo ""
echo "=================================================="
echo "FINAL TEST SUMMARY"
echo "=================================================="
echo "Node versions tested: $TEST_VERSIONS"
echo "Passed: $OVERALL_PASSED"
echo "Failed: $OVERALL_FAILED"

if [ ! -z "$FAILED_VERSIONS" ]; then
    echo "Failed versions:$FAILED_VERSIONS"
fi

echo "=================================================="

# Results are now written directly to /project/test-staging/integration-results/
# No need to copy them elsewhere

# If NO_CLEANUP is set, keep container running for debugging
if [ -n "$NO_CLEANUP" ]; then
    echo ""
    echo "=================================================="
    echo "KEEPING CONTAINER ALIVE FOR DEBUGGING"
    echo "=================================================="
    echo "Container will stay running. To debug:"
    echo "  - From host: docker exec -it comply-server-integration-test /bin/bash"
    echo "  - Test files are in: /project/test/"
    echo "  - Test results are in: /project/test-staging/integration-results/"
    echo "=================================================="
    echo ""

    # Keep container running with a sleep loop
    echo "Entering debug mode (container will stay alive)..."
    while true; do
        sleep 3600  # Sleep for 1 hour at a time
    done
fi

# Exit with appropriate code
if [ $OVERALL_FAILED -gt 0 ]; then
    exit 1
else
    exit 0
fi