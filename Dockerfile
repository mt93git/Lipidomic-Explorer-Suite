# Dockerfile for testing Lipidomic Explorer bootstrapping sequence
# Uses the exact same R version the user is running on Windows (R 4.4.0)
FROM rocker/r-ver:4.4.0

# Install system dependencies required by some R packages (curl, ssl, xml2, zlib)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcurl4-openssl-dev \
    libssl-dev \
    libxml2-dev \
    zlib1g-dev \
    pandoc \
    && rm -rf /var/lib/apt/lists/*

# Set working directory inside the container
WORKDIR /app

# Copy all project files into the container
COPY . /app/

# Environment variable to force binary options if needed.
# Since it is Linux, PPM will provide Linux binaries where possible.
ENV R_FORCE_BINARY=FALSE

# Run the environment setup script to test the bootstrap installation from scratch.
# This serves as our automated build-time environment verification.
RUN Rscript --vanilla 00_ENVIRONMENT_SETUP.R

# Clean up build artifacts
RUN rm -rf /tmp/*

# Configure sandboxed library path in user environment
ENV R_LIBS_USER=/root/.R/LipidomicExplorer_Library/4.4

# Default command: launch the Shiny App (listen on port 3838, open to all network interfaces)
EXPOSE 3838
CMD ["Rscript", "-e", "shiny::runApp(appDir = '.', port = 3838, host = '0.0.0.0', launch.browser = FALSE)"]
