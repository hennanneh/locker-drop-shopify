# LockerDrop Security Incident Response Policy

**Version:** 1.0
**Last Updated:** December 6, 2025
**Owner:** LockerDrop Security Team

---

## 1. Purpose

This policy outlines the procedures for detecting, responding to, and recovering from security incidents that may affect LockerDrop, its merchants, or customer data.

---

## 2. Scope

This policy applies to:
- All LockerDrop systems and infrastructure
- All personal data processed by LockerDrop
- All employees, contractors, and third-party service providers

---

## 3. Incident Classification

### Severity Levels

| Level | Description | Examples | Response Time |
|-------|-------------|----------|---------------|
| **Critical** | Active breach, data exfiltration, system compromise | Unauthorized access to customer data, ransomware, database breach | Immediate (< 1 hour) |
| **High** | Potential breach, significant vulnerability | Exposed credentials, unpatched critical vulnerability, suspicious access patterns | < 4 hours |
| **Medium** | Security concern, limited impact | Failed login attempts, minor vulnerability, policy violation | < 24 hours |
| **Low** | Minor issue, no data at risk | Informational alert, best practice deviation | < 72 hours |

---

## 4. Incident Response Team

### Primary Contacts

| Role | Responsibility |
|------|----------------|
| **Incident Commander** | Overall incident management, communication, decisions |
| **Technical Lead** | Investigation, containment, remediation |
| **Communications Lead** | Stakeholder notification, public communications |

### Contact Information

- **Primary Contact:** [Your Name] - [Phone] - [Email]
- **Secondary Contact:** [Backup Name] - [Phone] - [Email]
- **Email:** security@lockerdrop.it

---

## 5. Incident Response Phases

### Phase 1: Detection & Identification

**Indicators of Compromise (IOCs):**
- Unusual database queries or access patterns
- Failed authentication attempts from multiple IPs
- Unexpected data exports or downloads
- Alerts from monitoring systems
- Reports from merchants or users
- Third-party breach notifications

**Detection Sources:**
- Audit logs (audit_log table)
- Server logs (PM2, nginx)
- Database query logs
- Error monitoring
- User reports

### Phase 2: Containment

**Immediate Actions:**

1. **Isolate affected systems**
   ```bash
   # Stop the affected service
   pm2 stop lockerdrop

   # Block suspicious IPs (if applicable)
   # Add to firewall rules
   ```

2. **Preserve evidence**
   ```bash
   # Export audit logs
   node -e "const db = require('./db'); db.query('SELECT * FROM audit_log WHERE timestamp > NOW() - INTERVAL 24 hour').then(r => console.log(JSON.stringify(r.rows)))" > incident_logs.json

   # Backup current database state
   pg_dump [connection] > incident_backup_$(date +%Y%m%d_%H%M%S).sql
   ```

3. **Revoke compromised credentials**
   - Rotate Shopify API keys if compromised
   - Rotate database passwords
   - Revoke affected OAuth tokens

### Phase 3: Eradication

1. **Identify root cause**
   - Review audit logs
   - Analyze attack vectors
   - Document findings

2. **Remove threat**
   - Patch vulnerabilities
   - Remove malicious code/access
   - Update compromised credentials

3. **Verify removal**
   - Scan systems
   - Review logs for continued activity

### Phase 4: Recovery

1. **Restore services**
   ```bash
   # Restart services
   pm2 restart lockerdrop

   # Verify functionality
   curl https://app.lockerdrop.it/health
   ```

2. **Monitor for recurrence**
   - Enhanced logging for 30 days
   - Daily log reviews

3. **Validate data integrity**
   - Check database consistency
   - Verify order data

### Phase 5: Post-Incident

1. **Document incident**
   - Timeline of events
   - Actions taken
   - Data affected

2. **Lessons learned**
   - Root cause analysis
   - Prevention measures
   - Process improvements

3. **Update security measures**
   - Patch vulnerabilities
   - Update policies
   - Additional monitoring

---

## 6. Notification Requirements

### Internal Notification

| Severity | Notify |
|----------|--------|
| Critical | Immediately - all team members |
| High | Within 4 hours - technical team |
| Medium | Within 24 hours - relevant parties |
| Low | Weekly security report |

### External Notification

#### Shopify
- Notify Shopify Partner Support within 24 hours of confirmed breach
- Email: partners@shopify.com
- Include: Nature of incident, data affected, remediation steps

#### Affected Merchants
- Notify within 72 hours of confirmed breach
- Include: What happened, what data affected, what we're doing, what they should do

#### Regulatory (if required)
- GDPR: 72 hours to supervisory authority
- CCPA: As required
- Other: Based on jurisdiction

### Notification Template

```
Subject: Security Incident Notification - LockerDrop

Dear [Merchant/User],

We are writing to inform you of a security incident that may have affected your data.

**What Happened:**
[Brief description]

**What Information Was Involved:**
[Types of data]

**What We Are Doing:**
[Actions taken]

**What You Can Do:**
[Recommendations]

**For More Information:**
Contact us at security@lockerdrop.it

We sincerely apologize for any inconvenience.

LockerDrop Security Team
```

---

## 7. Data Breach Specific Procedures

### If Customer Data is Compromised:

1. **Immediately:**
   - Contain the breach
   - Preserve evidence
   - Assess scope

2. **Within 24 hours:**
   - Determine what data was accessed
   - Identify affected merchants/customers
   - Begin remediation

3. **Within 72 hours:**
   - Notify Shopify
   - Notify affected merchants
   - Report to regulators (if required)

4. **Within 7 days:**
   - Complete investigation
   - Implement fixes
   - Document incident

---

## 8. Evidence Preservation

### What to Preserve:
- Audit logs
- Server logs
- Database snapshots
- Network logs
- Screenshots
- Communications

### How to Preserve:
- Create read-only copies
- Document chain of custody
- Store securely
- Maintain for minimum 1 year

---

## 9. Communication Guidelines

### Do:
- Be factual and accurate
- Provide clear next steps
- Update regularly
- Document all communications

### Don't:
- Speculate on cause
- Assign blame publicly
- Share technical details publicly
- Communicate via insecure channels

---

## 10. Testing & Training

### Annual Requirements:
- Incident response drill (tabletop exercise)
- Policy review and update
- Team training
- Contact information verification

### Quarterly:
- Review audit logs
- Test backup restoration
- Update runbooks

---

## 11. Third-Party Incidents

If a third-party service is compromised:

| Service | Action |
|---------|--------|
| **Digital Ocean** | Rotate DB credentials, review access logs |
| **Harbor Locker** | Rotate API keys, notify affected orders |
| **Shopify** | Follow Shopify's guidance, rotate tokens |

---

## 12. Appendix

### A. Quick Reference Card

```
INCIDENT DETECTED?

1. STOP - Don't panic
2. CONTAIN - Isolate if needed: pm2 stop lockerdrop
3. PRESERVE - Export logs before changes
4. REPORT - Contact security@lockerdrop.it
5. DOCUMENT - Write down what you observed
```

### B. Key Commands

```bash
# View recent audit logs
node -e "const db=require('./db');db.query(\"SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT 100\").then(r=>console.log(JSON.stringify(r.rows,null,2)))"

# Check for suspicious access
node -e "const db=require('./db');db.query(\"SELECT ip_address, COUNT(*) FROM audit_log GROUP BY ip_address ORDER BY count DESC\").then(r=>console.log(r.rows))"

# Stop service
pm2 stop lockerdrop

# View service logs
pm2 logs lockerdrop --lines 1000
```

### C. Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Dec 6, 2025 | Initial policy |

---

*This policy should be reviewed annually and updated as needed.*
