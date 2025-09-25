#!/bin/bash

# Helper script to debug the test container

CONTAINER_NAME="comply-server-integration-test"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Checking if test container is running...${NC}"

if docker ps | grep -q $CONTAINER_NAME; then
    echo -e "${GREEN}✓ Container is running${NC}"
    echo ""
    echo "Available commands:"
    echo "  1) Enter container shell"
    echo "  2) View container logs"
    echo "  3) View test results"
    echo "  4) Re-run tests inside container"
    echo "  5) Stop and remove container"
    echo ""
    read -p "Select option (1-5): " choice

    case $choice in
        1)
            echo "Entering container shell..."
            docker exec -it $CONTAINER_NAME /bin/bash
            ;;
        2)
            echo "Container logs:"
            docker logs $CONTAINER_NAME
            ;;
        3)
            echo "Test results:"
            docker exec $CONTAINER_NAME ls -la /project/test-staging/integration-results/ 2>/dev/null || echo "No results found"
            for result_file in $(docker exec $CONTAINER_NAME ls /project/test-staging/integration-results/*.json 2>/dev/null || echo ""); do
                if [ ! -z "$result_file" ]; then
                    echo ""
                    echo "Content of $result_file:"
                    docker exec $CONTAINER_NAME cat $result_file
                fi
            done
            ;;
        4)
            echo "Re-running tests..."
            docker exec -it $CONTAINER_NAME /bin/bash -c "cd /project && node /project/test/test-server.js"
            ;;
        5)
            echo "Stopping and removing container..."
            docker compose -f test/docker-compose.yml down
            ;;
        *)
            echo "Invalid option"
            ;;
    esac
else
    echo -e "${RED}✗ Container is not running${NC}"
    echo ""
    echo "To start a test container for debugging, run:"
    echo "  NO_CLEANUP=true TEST_SINGLE_VERSION=24 npm run test:integration"
fi