# Deployment Guide

Complete guide for deploying Scan4Earn to production environments.

## Deployment Overview

```
                           ┌─────────────────┐
                           │  Git Repository │
                           └────────┬────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
             ┌─────────────┐  ┌──────────┐  ┌─────────────┐
             │ Development │  │ Staging  │  │ Production  │
             │  (Local)    │  │          │  │             │
             └─────────────┘  └──────────┘  └─────────────┘
```

## Pre-Deployment Checklist

### Code Quality
- [ ] All tests passing: `npm test`
- [ ] No ESLint errors: `npm run lint`
- [ ] Code reviewed and approved
- [ ] No hardcoded secrets in code
- [ ] Version bumped in `package.json`
- [ ] CHANGELOG.md updated

### Security
- [ ] Secrets in environment variables (not code)
- [ ] HTTPS/TLS configured
- [ ] Rate limiting enabled
- [ ] CORS configured correctly
- [ ] Security headers enabled
- [ ] Database credentials secured

### Database
- [ ] Migration tested locally
- [ ] Backup created
- [ ] Migration scripts prepared
- [ ] Rollback plan documented
- [ ] Schema changes reviewed

### Documentation
- [ ] API changes documented
- [ ] Configuration options listed
- [ ] Breaking changes noted
- [ ] Deployment steps tested

## Deployment to Google Cloud Run

### Prerequisites

```bash
# Install gcloud CLI
curl https://sdk.cloud.google.com | bash

# Authenticate
gcloud auth login

# Set project
gcloud config set project PROJECT_ID

# Enable required APIs
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable cloudsql.googleapis.com
```

### Build & Push Image

#### Option 1: Using Cloud Build (Recommended)

```bash
# Configure Build
cat > cloudbuild.yaml << 'EOF'
steps:
  # Build image
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', 'gcr.io/$PROJECT_ID/scan4earn-server:$SHORT_SHA', '.']
  
  # Push to Container Registry
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'gcr.io/$PROJECT_ID/scan4earn-server:$SHORT_SHA']
  
  # Deploy to Cloud Run
  - name: 'gcr.io/cloud-builders/gke-deploy'
    args:
      - run
      - --filename=.
      - --image=gcr.io/$PROJECT_ID/scan4earn-server:$SHORT_SHA
      - --location=us-central1
      - --output=/workspace/output

images: ['gcr.io/$PROJECT_ID/scan4earn-server:$SHORT_SHA']

# Build triggers
onFailure: ['NOTIFY']
EOF

# Submit build
gcloud builds submit --config=cloudbuild.yaml
```

#### Option 2: Manual Docker Build

```bash
# Build image locally
docker build -t gcr.io/PROJECT_ID/scan4earn-server:latest .

# Push to Container Registry
docker push gcr.io/PROJECT_ID/scan4earn-server:latest

# Or use gcloud build
gcloud builds submit --tag gcr.io/PROJECT_ID/scan4earn-server:latest
```

### Deploy to Cloud Run

```bash
# Deploy from image
gcloud run deploy scan4earn-server \
  --image gcr.io/PROJECT_ID/scan4earn-server:latest \
  --platform managed \
  --region us-central1 \
  --memory 512Mi \
  --cpu 1 \
  --timeout 30 \
  --concurrency 100 \
  --allow-unauthenticated

# Or deploy from source
gcloud run deploy scan4earn-server \
  --source . \
  --platform managed \
  --region us-central1 \
  --memory 512Mi \
  --cpu 1
```

### Configure Environment Variables

```bash
# Set environment variables
gcloud run services update scan4earn-server \
  --update-env-vars NODE_ENV=production \
  --region us-central1

# Or set from file
gcloud run services update scan4earn-server \
  --env-vars-file=.env.production \
  --region us-central1
```

### Connect to Cloud SQL

```bash
# Get Cloud SQL instance
INSTANCE_NAME=$(gcloud sql instances list --format='value(name)' | head -1)

# Create Cloud SQL proxy
gcloud run services update scan4earn-server \
  --set-cloudsql-instances PROJECT_ID:us-central1:INSTANCE_NAME \
  --region us-central1

# Or set DB_HOST environment variable
gcloud run services update scan4earn-server \
  --update-env-vars DB_HOST=/cloudsql/PROJECT_ID:us-central1:INSTANCE_NAME \
  --region us-central1
```

### Run Database Migrations

```bash
# Create migration Cloud Run job
gcloud run jobs create scan4earn-migrate \
  --image gcr.io/PROJECT_ID/scan4earn-server:latest \
  --set-cloudsql-instances PROJECT_ID:us-central1:INSTANCE_NAME \
  --command='npm run migrate:up' \
  --region us-central1

# Execute migration
gcloud run jobs execute scan4earn-migrate --region us-central1

# Check status
gcloud run jobs log scan4earn-migrate --region us-central1
```

## Database Migration Strategy

### Pre-Migration Tasks

```bash
# 1. Create backup
gcloud sql backups create scan4earn-pre-migration-backup \
  --instance=scan4earn-db \
  --description="Before deployment on 2026-05-31"

# 2. Test migration locally
npm run migrate:up

# 3. Verify data integrity
psql -h localhost -U postgres -d scan4earn_db -c "
  SELECT COUNT(*) as users FROM users;
  SELECT COUNT(*) as products FROM products;
"

# 4. Review migration script
cat migrations/xxx_description.sql
```

### Run Migration on Production

```bash
# Option 1: Using Cloud SQL proxy
cloud_sql_proxy -instances=PROJECT_ID:REGION:INSTANCE_NAME &

psql -h 127.0.0.1 -U postgres -d scan4earn_db -f migrations/xxx_description.sql

# Option 2: Using Cloud Run Job
gcloud run jobs create scan4earn-migrate-prod \
  --image gcr.io/PROJECT_ID/scan4earn-server:latest \
  --set-cloudsql-instances PROJECT_ID:REGION:INSTANCE_NAME \
  --command='psql ... -f migrations/xxx_description.sql' \
  --region REGION

gcloud run jobs execute scan4earn-migrate-prod --region REGION

# Option 3: SSH to VM and run directly
gcloud compute ssh deployment-vm-1 --zone us-central1-a
psql -h cloudsql-host -U postgres -d scan4earn_db -f migrations/xxx_description.sql
```

### Rollback Plan

```bash
# If migration fails:
1. Stop application
2. Restore from backup
3. Verify data integrity
4. Re-deploy previous version
5. Investigate issue locally
6. Test fix
7. Retry deployment

# Restore from backup
gcloud sql backups restore BACKUP_ID \
  --backup-instance=scan4earn-db \
  --backup-configuration=default
```

## Monitoring & Verification

### Check Deployment Status

```bash
# Get service details
gcloud run services describe scan4earn-server --region us-central1

# Check service URL
SERVICE_URL=$(gcloud run services describe scan4earn-server \
  --format 'value(status.url)' \
  --region us-central1)

echo "Service URL: $SERVICE_URL"
```

### Health Checks

```bash
# Health endpoint
curl https://SERVICE_URL/health

# Expected response:
{
  "status": "healthy",
  "server": "running",
  "database": "connected"
}

# Check logs
gcloud run services logs read scan4earn-server --limit 50

# Stream logs
gcloud run services logs read scan4earn-server --limit 50 --follow
```

### Performance Testing

```bash
# Load test with Apache Bench
ab -n 1000 -c 10 https://SERVICE_URL/health

# Or use k6
k6 run load-test.js --vus 10 --duration 30s

# Monitor metrics
gcloud monitoring dashboards describe scan4earn-dashboard
```

## Blue-Green Deployment

For zero-downtime updates:

```bash
# 1. Deploy new version to production
gcloud run deploy scan4earn-server-v2 \
  --image gcr.io/PROJECT_ID/scan4earn-server:v2 \
  --no-traffic \
  --region us-central1

# 2. Verify new version
curl https://scan4earn-server-v2-xxxx.run.app/health

# 3. Switch traffic
gcloud run services update-traffic scan4earn-server-v2 \
  --to-revisions LATEST=100 \
  --region us-central1

# 4. Monitor for issues
gcloud run services logs read scan4earn-server-v2 --limit 100

# 5. Rollback if needed
gcloud run services update-traffic scan4earn-server-v2 \
  --to-revisions PREVIOUS=100 \
  --region us-central1
```

## Scaling Configuration

### Auto-Scaling

```bash
# Configure Cloud Run auto-scaling
gcloud run services update scan4earn-server \
  --min-instances 1 \
  --max-instances 10 \
  --memory 512Mi \
  --cpu 1 \
  --concurrency 100 \
  --region us-central1
```

### Database Scaling

```bash
# Increase Cloud SQL instance size
gcloud sql instances patch scan4earn-db \
  --tier=db-n1-standard-2 \
  --backup-start-time=03:00

# Increase connections
gcloud sql instances patch scan4earn-db \
  --database-flags=max_connections=100

# Monitor connections
gcloud sql operations list --instance=scan4earn-db
```

## Backup & Recovery

### Automated Backups

```bash
# Enable automatic backups
gcloud sql backups create scan4earn-daily-backup \
  --instance=scan4earn-db \
  --backup-configuration=default

# Schedule daily backups at 3 AM
gcloud sql instances patch scan4earn-db \
  --backup-start-time=03:00 \
  --backup-location=us-central1

# Retention: 30 days (default)
```

### Manual Backup

```bash
# Create backup
gcloud sql backups create scan4earn-manual-backup-$(date +%Y%m%d) \
  --instance=scan4earn-db \
  --description="Manual backup before deployment"

# List backups
gcloud sql backups list --instance=scan4earn-db

# Restore from backup
gcloud sql backups restore BACKUP_ID \
  --backup-instance=scan4earn-db
```

## Secrets Management

### Store Secrets in Secret Manager

```bash
# Create secrets
gcloud secrets create scan4earn-jwt-secret \
  --data-file=- < /dev/stdin
gcloud secrets create scan4earn-db-password \
  --data-file=- < /dev/stdin

# Grant access to Cloud Run
gcloud secrets add-iam-policy-binding scan4earn-jwt-secret \
  --member=serviceAccount:scan4earn-server@PROJECT_ID.iam.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor

# Reference in Cloud Run
gcloud run services update scan4earn-server \
  --update-secrets JWT_ACCESS_SECRET=scan4earn-jwt-secret:latest \
  --region us-central1
```

## SSL/TLS Certificate

### Using Cloud Run Default HTTPS

Cloud Run automatically provides HTTPS certificate for `*.run.app` domains.

### Using Custom Domain

```bash
# Add custom domain
gcloud run domain-mappings create \
  --service=scan4earn-server \
  --domain=api.scan4earn.com \
  --region=us-central1

# Verify DNS
gcloud run domain-mappings describe api.scan4earn.com --region=us-central1

# Certificate is auto-provisioned by Google
```

## Logging & Monitoring

### Cloud Logging

```bash
# View logs
gcloud logging read "resource.type=cloud_run_revision" \
  --limit 50 \
  --format json

# Create log sink
gcloud logging sinks create scan4earn-sink \
  bigquery.googleapis.com/projects/PROJECT_ID/datasets/scan4earn_logs \
  --log-filter='resource.type="cloud_run_revision"'

# Tail logs
gcloud run services logs read scan4earn-server --follow
```

### Cloud Monitoring

```bash
# Create alert policy
gcloud alpha monitoring policies create \
  --notification-channels=CHANNEL_ID \
  --display-name="scan4earn server errors" \
  --condition-display-name="Error rate > 5%" \
  --condition-threshold-value=0.05

# View metrics
gcloud monitoring metrics-descriptors list --filter="resource.type=cloud_run_revision"

# Custom dashboard
gcloud monitoring dashboards create --config-from-file=dashboard.json
```

## Performance Optimization

### Image Size Optimization

```dockerfile
# Use multi-stage build
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY src ./src
COPY package.json ./
EXPOSE 8080
CMD ["node", "src/server.js"]
```

### Memory & CPU Optimization

```bash
# Default: 512Mi memory, 1 CPU
# Adjust based on load testing

gcloud run services update scan4earn-server \
  --memory 256Mi \  # Reduce if sufficient
  --cpu 1 \
  --concurrency 50 \
  --region us-central1
```

## Cost Optimization

### Cloud Run Pricing Optimization

```bash
# Use committed use discounts
# Monitor costs with Cloud Billing

# Set budget alert
gcloud billing budgets create \
  --billing-account=BILLING_ACCOUNT_ID \
  --display-name="scan4earn monthly budget" \
  --budget-amount=1000 \
  --threshold-rule percent=50 \
  --threshold-rule percent=100
```

## Troubleshooting Deployment

### Common Issues

**503 Service Unavailable**
```bash
# Check if service is healthy
gcloud run services describe scan4earn-server --region us-central1

# Check logs for errors
gcloud run services logs read scan4earn-server --limit 100 | grep ERROR

# Restart service
gcloud run services update scan4earn-server --region us-central1
```

**Database Connection Failed**
```bash
# Check Cloud SQL instance status
gcloud sql instances describe scan4earn-db

# Check network connectivity
gcloud compute networks list

# Verify IAM permissions
gcloud projects get-iam-policy PROJECT_ID | grep serviceAccount
```

**Out of Memory**
```bash
# Increase memory allocation
gcloud run services update scan4earn-server \
  --memory 1Gi \
  --region us-central1

# Monitor memory usage
gcloud monitoring time-series list \
  --filter='resource.type="cloud_run_revision"' \
  --format json
```

## Deployment Checklist

Before each deployment:

- [ ] All tests pass locally
- [ ] No console warnings or errors
- [ ] Database migrations tested
- [ ] Environment variables configured
- [ ] Secrets stored securely
- [ ] Image builds successfully
- [ ] Health endpoint works
- [ ] API endpoints respond
- [ ] Database connectivity verified
- [ ] Logs are being collected
- [ ] Monitoring alerts configured
- [ ] Rollback plan prepared
- [ ] Team notified of deployment

## Rollback Procedure

If deployment fails:

```bash
# 1. Identify previous working revision
gcloud run revisions list --service=scan4earn-server --region=us-central1

# 2. Route traffic back
gcloud run services update-traffic scan4earn-server \
  --to-revisions PREVIOUS_REVISION_ID=100 \
  --region=us-central1

# 3. Verify service is healthy
curl https://SERVICE_URL/health

# 4. Investigate issue
gcloud run revisions describe FAILED_REVISION_ID --region=us-central1

# 5. Fix and redeploy
# ... fix code ...
gcloud run deploy scan4earn-server --image=... --region=us-central1
```

## See Also

- [Docker & Cloud Run](02-DOCKER-CLOUDRUN.md)
- [Database Management](03-DATABASE-MANAGEMENT.md)
- [Monitoring & Logging](04-MONITORING-LOGGING.md)
- [Configuration Guide](../guides/03-CONFIGURATION.md)

---

**Last Updated:** 2026-05-31  
**Status:** Production Ready
