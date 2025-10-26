#!/bin/bash

# Lambda Build Script
# Builds and packages scheduler and worker Lambda functions for deployment to LocalStack

set -e

echo "=========================================="
echo "Building Lambda functions"
echo "=========================================="

# Create build directories
mkdir -p dist/lambda-scheduler
mkdir -p dist/lambda-worker

# ==========================================
# Build Scheduler Lambda
# ==========================================
echo ""
echo "Building scheduler Lambda..."
npx esbuild src/adapters/primary/lambda/schedulerHandler.ts \
  --bundle \
  --platform=node \
  --target=node20 \
  --outfile=dist/lambda-scheduler/schedulerHandler.js \
  --sourcemap \
  --external:@prisma/client \
  --external:pg-native \
  --minify

echo "Copying Prisma client to scheduler..."
mkdir -p dist/lambda-scheduler/node_modules/@prisma
mkdir -p dist/lambda-scheduler/node_modules/.prisma
cp -r node_modules/@prisma/client dist/lambda-scheduler/node_modules/@prisma/
cp -r node_modules/.prisma/client dist/lambda-scheduler/node_modules/.prisma/

echo "Copying package.json to scheduler..."
cp package.json dist/lambda-scheduler/

echo "Creating scheduler deployment package..."
cd dist/lambda-scheduler
zip -r ../event-scheduler.zip . -q
cd ../..

echo "✓ Scheduler Lambda build complete"
echo "  Package: dist/event-scheduler.zip"
echo "  Size: $(du -h dist/event-scheduler.zip | cut -f1)"

# ==========================================
# Build Worker Lambda
# ==========================================
echo ""
echo "Building worker Lambda..."
npx esbuild src/adapters/primary/lambda/workerHandler.ts \
  --bundle \
  --platform=node \
  --target=node20 \
  --outfile=dist/lambda-worker/workerHandler.js \
  --sourcemap \
  --external:@prisma/client \
  --external:pg-native \
  --minify

echo "Copying Prisma client to worker..."
mkdir -p dist/lambda-worker/node_modules/@prisma
mkdir -p dist/lambda-worker/node_modules/.prisma
cp -r node_modules/@prisma/client dist/lambda-worker/node_modules/@prisma/
cp -r node_modules/.prisma/client dist/lambda-worker/node_modules/.prisma/

echo "Copying package.json to worker..."
cp package.json dist/lambda-worker/

echo "Creating worker deployment package..."
cd dist/lambda-worker
zip -r ../event-worker.zip . -q
cd ../..

echo "✓ Worker Lambda build complete"
echo "  Package: dist/event-worker.zip"
echo "  Size: $(du -h dist/event-worker.zip | cut -f1)"

echo ""
echo "=========================================="
echo "All Lambda builds complete!"
echo "=========================================="
echo "Scheduler: dist/event-scheduler.zip ($(du -h dist/event-scheduler.zip | cut -f1))"
echo "Worker:    dist/event-worker.zip ($(du -h dist/event-worker.zip | cut -f1))"
echo "=========================================="
