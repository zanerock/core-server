# We would like to use Alpine, but node requires glibc, and alpine doesn't have it.
FROM ubuntu:latest

# Install dependencies for testing and multiple Node versions
RUN apt-get update && apt-get install -y \
    bash \
    curl \
    git \
    jq \
    make \
    python3 \
    ca-certificates \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Create a test user
RUN useradd -m -s /bin/bash testuser

# Switch to test user
USER testuser
WORKDIR /home/testuser

# Create bash profile for nvm
RUN touch /home/testuser/.bashrc

# Install nvm for managing multiple Node versions
ENV NVM_DIR /home/testuser/.nvm
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# Add nvm to PATH for subsequent RUN commands
SHELL ["/bin/bash", "-c"]

# Source nvm and pre-install all Node versions to speed up tests and enable offline testing.
# Installing all major versions from 18 onwards that are commonly tested
RUN source $NVM_DIR/nvm.sh && \
    nvm install 18 && \
    nvm install 19 && \
    nvm install 20 && \
    nvm install 21 && \
    nvm install 22 && \
    nvm install 23 && \
    nvm install 24 && \
    nvm alias default 18

# Create directories that will be used when volume is mounted
RUN mkdir -p /home/testuser && chown testuser:testuser /home/testuser

# Set working directory (will be overridden by volume mount)
WORKDIR /home/testuser

# The entrypoint will be our test runner script from the mounted volume
ENTRYPOINT ["/bin/bash", "/project/test/run-tests.sh"]