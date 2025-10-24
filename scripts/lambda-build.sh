#!/bin/bash

# Lambda Build Script
# Builds and packages the scheduler Lambda function for deployment to LocalStack

set -e

echo "=========================================="
echo "Building Lambda function: event-scheduler"
echo "=========================================="

# Create build directory
mkdir -p dist/lambda

# Build scheduler handler using esbuild
echo "Building scheduler handler with esbuild..."
npx esbuild src/adapters/primary/lambda/schedulerHandler.ts \
  --bundle \
  --platform=node \
  --target=node20 \
  --outfile=dist/lambda/schedulerHandler.js \
  --sourcemap \
  --external:@prisma/client \
  --external:pg-native \
  --minify

# Copy Prisma client to dist/lambda
echo "Copying Prisma client..."
mkdir -p dist/lambda/node_modules/@prisma
mkdir -p dist/lambda/node_modules/.prisma
cp -r node_modules/@prisma/client dist/lambda/node_modules/@prisma/
cp -r node_modules/.prisma/client dist/lambda/node_modules/.prisma/

# Copy package.json for dependencies
echo "Copying package.json..."
cp package.json dist/lambda/

# Create deployment package
echo "Creating deployment package..."
cd dist/lambda
zip -r ../event-scheduler.zip . -q
cd ../..

echo "=========================================="
echo "Lambda build complete!"
echo "=========================================="
echo "Package: dist/event-scheduler.zip"
echo "Size: $(du -h dist/event-scheduler.zip | cut -f1)"
echo "=========================================="
