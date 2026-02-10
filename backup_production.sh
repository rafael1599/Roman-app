#!/bin/bash

# ============================================================================
# SUPABASE PRODUCTION DATABASE BACKUP
# ============================================================================
# This script creates a complete backup of your production Supabase database
# Date: $(date +%Y-%m-%d)
# ============================================================================

# Configuration
PROJECT_REF="xexkttehzpxtviebglei"
BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/roman-app_prod_backup_${TIMESTAMP}.sql"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Supabase Production Backup${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Create backup directory if it doesn't exist
mkdir -p "${BACKUP_DIR}"

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo -e "${RED}Error: Supabase CLI is not installed${NC}"
    echo "Install it with: npm install -g supabase"
    exit 1
fi

echo -e "${YELLOW}Project Reference:${NC} ${PROJECT_REF}"
echo -e "${YELLOW}Backup Location:${NC} ${BACKUP_FILE}"
echo ""

# Link to production project
echo -e "${GREEN}Step 1: Linking to production project...${NC}"
npx supabase link --project-ref "${PROJECT_REF}"

if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to link to production project${NC}"
    echo "Make sure you're logged in: npx supabase login"
    exit 1
fi

# Create database dump
echo -e "${GREEN}Step 2: Creating database dump...${NC}"
npx supabase db dump --linked > "${BACKUP_FILE}"

if [ $? -eq 0 ]; then
    FILESIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}✓ Backup completed successfully!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo -e "${YELLOW}File:${NC} ${BACKUP_FILE}"
    echo -e "${YELLOW}Size:${NC} ${FILESIZE}"
    echo ""
    echo -e "${YELLOW}Next steps:${NC}"
    echo "1. Review the backup file"
    echo "2. Execute production_cleanup_duplicates.sql"
    echo "3. Keep this backup until you verify the cleanup"
else
    echo -e "${RED}Failed to create backup${NC}"
    exit 1
fi

# Optional: Also backup to a compressed file
echo ""
read -p "Do you want to create a compressed backup as well? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    gzip -c "${BACKUP_FILE}" > "${BACKUP_FILE}.gz"
    GZSIZE=$(du -h "${BACKUP_FILE}.gz" | cut -f1)
    echo -e "${GREEN}✓ Compressed backup created:${NC} ${BACKUP_FILE}.gz (${GZSIZE})"
fi

echo ""
echo -e "${GREEN}Done!${NC}"
