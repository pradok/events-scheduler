#!/bin/bash
# Database Reset Script
# Resets the database by dropping all data, reapplying migrations, and reseeding

echo "⚠️  WARNING: This will delete ALL data from the database!"
echo "Press Ctrl+C to cancel, or Enter to continue..."
read

echo "🔄 Resetting database..."
npx prisma migrate reset --force

echo "✅ Database reset complete!"
