# Security

Comprehensive security measures for the Time-Based Event Scheduling System, covering input validation, authentication, secrets management, API security, data protection, and security testing.

Reference: [Full Architecture Document](../architecture.md)

---

## Input Validation

### Validation Library
**Zod 3.22.4** - TypeScript-first schema validation

### Validation Location
API boundary (Express middleware) before reaching use cases

### Required Rules

All external inputs MUST:
1. Be validated against Zod schemas
2. Pass validation at API boundary before processing
3. Follow whitelist approach: only accept explicitly defined fields (no additional properties)

### Validation Example

```typescript
import { z } from 'zod';

const CreateUserSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timezone: z.string().refine((tz) => Timezone.isValid(tz), {
    message: 'Invalid IANA timezone identifier'
  })
}).strict(); // No additional properties allowed

// Usage in middleware
function validateCreateUser(req: Request, res: Response, next: NextFunction) {
  try {
    const validated = CreateUserSchema.parse(req.body);
    req.validatedData = validated;
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Invalid input data',
          details: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        }
      });
    }
    next(error);
  }
}
```

### Validation Best Practices

1. **Never trust client input**: Validate all data from external sources
2. **Whitelist approach**: Only accept explicitly defined fields
3. **Type safety**: Leverage TypeScript types derived from Zod schemas
4. **Clear error messages**: Provide field-level validation feedback
5. **Early validation**: Fail fast at API boundary before business logic

---

## Authentication & Authorization

### Phase 1 (Current)
**No authentication** - Local development only, not exposed to public internet

### Phase 2+ Requirements

When deploying to AWS:

#### JWT-Based Authentication
```typescript
interface JWTPayload {
  sub: string;      // User ID
  email: string;    // User email
  iat: number;      // Issued at
  exp: number;      // Expiration
}

// Middleware example
async function authenticateJWT(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Missing authentication token' }
    });
  }

  try {
    const payload = await verifyJWT(token);
    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' }
    });
  }
}
```

#### API Key Validation
For webhook signature verification:
```typescript
function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

#### IAM Roles
Lambda execution permissions (AWS IAM):
- Read/Write RDS (via VPC)
- Send/Receive SQS messages
- Read Secrets Manager
- Write CloudWatch Logs

---

## Secrets Management

### Development Environment
- **Method**: `.env` files (gitignored)
- **Template**: `.env.example` committed to repository
- **Location**: Project root

#### Example .env.example
```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/bday

# AWS (for LocalStack)
AWS_REGION=us-east-1
AWS_ENDPOINT=http://localhost:4566

# Application
NODE_ENV=development
LOG_LEVEL=debug

# External Services
WEBHOOK_URL=http://localhost:3001/webhook
WEBHOOK_SECRET=<secret-key>
```

### Production Environment (Phase 2+)
- **Method**: AWS Secrets Manager or Parameter Store
- **Access**: Via IAM roles with least privilege
- **Rotation**: Automatic rotation for database credentials

#### Code Requirements

1. **NEVER hardcode secrets** (enforced by code review and SAST)
2. **Access via environment variables only**
   ```typescript
   const dbUrl = process.env.DATABASE_URL;
   if (!dbUrl) {
     throw new Error('DATABASE_URL environment variable is required');
   }
   ```
3. **No secrets in logs or error messages**
   ```typescript
   // Pino serializer to redact secrets
   const logger = pino({
     serializers: {
       req: (req) => ({
         method: req.method,
         url: req.url,
         // Never log headers containing secrets
         headers: redactHeaders(req.headers)
       })
     }
   });
   ```

---

## API Security

### Rate Limiting

#### Phase 1
Not implemented - local development only

#### Phase 2+
AWS API Gateway throttling:
- **Burst**: 1000 requests/second
- **Rate**: 500 requests/second sustained
- **Per-User**: 100 requests/minute (after authentication)

### CORS Policy

#### Phase 1
Allow all origins for local development:
```typescript
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE']
}));
```

#### Phase 2+
Restrict to known origins:
```typescript
app.use(cors({
  origin: [
    'https://app.example.com',
    'https://staging.example.com'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));
```

### Security Headers (Phase 2+)

Using Helmet.js middleware:
```typescript
import helmet from 'helmet';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));
```

### HTTPS Enforcement

#### Phase 1
Not applicable - local development (HTTP)

#### Phase 2+
- API Gateway enforces HTTPS
- No HTTP endpoints exposed
- TLS 1.2+ only

---

## Data Protection

### Encryption at Rest

#### Development
PostgreSQL default encryption (no additional configuration)

#### Production (Phase 2+)
AWS RDS encryption enabled:
- **Method**: AES-256 encryption
- **Key Management**: AWS KMS
- **Scope**: All database storage, snapshots, and backups

### Encryption in Transit

All network communication uses TLS 1.2+:
- **API**: HTTPS for all API endpoints
- **Database**: TLS for PostgreSQL connections
- **SQS**: HTTPS for SQS API calls
- **Webhooks**: HTTPS for external webhook deliveries

#### PostgreSQL TLS Configuration
```typescript
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
      // Force TLS in production
      ssl: process.env.NODE_ENV === 'production' ? {
        rejectUnauthorized: true
      } : undefined
    }
  }
});
```

### PII Handling

#### What is PII in this system?
- First name
- Last name
- Date of birth

#### Protection Measures

1. **No logging of full values** - Only log user IDs
   ```typescript
   // Good
   logger.info({ userId: user.id }, 'User created');

   // Bad
   logger.info({ firstName: user.firstName, lastName: user.lastName }, 'User created');
   ```

2. **Database access control** - Restrict read access to PII columns

3. **Audit trail** - Track all PII access (Phase 2+)

### Logging Restrictions

Never log:
- Passwords or password hashes
- API keys or secrets
- Full PII (names, dates of birth)
- Authentication tokens

Use Pino serializers to automatically redact sensitive data:
```typescript
const logger = pino({
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers["x-api-key"]',
      'password',
      'secret',
      'token'
    ],
    censor: '[REDACTED]'
  }
});
```

---

## Dependency Security

### Scanning Tool
**npm audit** (built-in)

### Update Policy

1. **Monthly dependency reviews**: Check for updates and vulnerabilities
2. **Immediate updates for critical vulnerabilities**: Within 24 hours
3. **Regular updates for high/medium vulnerabilities**: Within 1 week

### Audit Process

```bash
# Check for vulnerabilities
npm audit

# Review and fix automatically fixable issues
npm audit fix

# Manual review for breaking changes
npm audit fix --dry-run

# Update specific package
npm update <package-name>
```

### Approval Process

Before adding new dependencies:
1. **Justification required**: Why is this dependency needed?
2. **Review package reputation**:
   - Download count
   - Last updated date
   - Number of maintainers
   - Security history
3. **Check for alternatives**: Prefer well-maintained, popular packages
4. **Minimize dependencies**: Use standard library when possible

### Lock Files
- **Commit `package-lock.json`** to repository
- **Use exact versions** in CI/CD pipelines
- **Review changes** in dependency updates carefully

---

## Security Testing

### SAST (Static Application Security Testing)

#### Tool
ESLint with security plugins:
- `eslint-plugin-security`
- `@typescript-eslint/eslint-plugin`

#### Configuration
```json
{
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:security/recommended"
  ],
  "rules": {
    "security/detect-object-injection": "error",
    "security/detect-non-literal-regexp": "warn",
    "security/detect-unsafe-regex": "error",
    "@typescript-eslint/no-explicit-any": "error"
  }
}
```

#### CI Integration
Run on every commit:
```yaml
# .github/workflows/ci.yml
- name: Run ESLint
  run: npm run lint
```

### DAST (Dynamic Application Security Testing)

Not included in Phase 1. Consider for Phase 2+:
- OWASP ZAP
- Burp Suite
- AWS Security Hub

### Penetration Testing

Not included in Phase 1. Plan for Phase 2+ production readiness:
- Third-party security audit
- Vulnerability assessment
- Compliance validation (if required)

---

## Security Checklist

### Development Phase
- [x] Input validation with Zod at API boundary
- [x] No hardcoded secrets
- [x] Environment variables for configuration
- [x] ESLint security plugin enabled
- [x] PII redaction in logs
- [x] npm audit in CI pipeline

### Pre-Production (Phase 2+)
- [ ] JWT authentication implemented
- [ ] API rate limiting configured
- [ ] CORS policy restricted to known origins
- [ ] Helmet.js security headers enabled
- [ ] HTTPS enforced (API Gateway)
- [ ] RDS encryption enabled
- [ ] Secrets Manager configured
- [ ] IAM roles with least privilege
- [ ] CloudTrail audit logging enabled

### Production (Phase 2+)
- [ ] Security audit completed
- [ ] Penetration testing performed
- [ ] Incident response plan documented
- [ ] Security monitoring and alerting configured
- [ ] Backup and disaster recovery tested
- [ ] Compliance requirements validated

---

## Incident Response (Phase 2+)

### Response Team
- Engineering Lead
- Operations Engineer
- Security Specialist (if available)

### Response Procedure

1. **Detection**: Automated alerts or manual report
2. **Assessment**: Determine severity and impact
3. **Containment**: Isolate affected systems
4. **Eradication**: Remove threat and fix vulnerability
5. **Recovery**: Restore normal operations
6. **Lessons Learned**: Document and improve

### Communication Plan

- **Internal**: Slack channel + email
- **External**: Status page updates (if customer-facing)
- **Compliance**: Report to authorities if required

---
