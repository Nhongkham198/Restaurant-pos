# Firestore Security Specification

## 1. Data Invariants
- **Identity Integrity**: Every write to a user-owned or staff-created resource must match `request.auth.uid` or be performed by a verified administrator.
- **Relational Integrity**: Orders, stock logs, and maintenance logs must be linked to a valid `branchId`.
- **Temporal Integrity**: `orderTime`, `lastUpdated`, and `timestamp` fields must be validated against `request.time` (server timestamp).
- **State Integrity**: `ActiveOrder` status transitions must follow the valid lifecycle: `pending_payment` -> `waiting` -> `cooking` -> `served` -> `completed`/`cancelled`.
- **Type Safety**: All fields must strictly match their expected Typescript types (number, string, boolean, list, map).

## 2. The "Dirty Dozen" (Attack Payloads)

| # | Attack Name | Target Path | payload | Expected Result |
|---|-------------|-------------|---------|-----------------|
| 1 | Admin Spoof | `/admins/attackerUid` | `{ "email": "attacker@evil.com" }` | `PERMISSION_DENIED` |
| 2 | Shadow Field Injection | `/branches/B1/activeOrders/O1` | `{ ..., "isVerified": true }` | `PERMISSION_DENIED` |
| 3 | Order Status Jump | `/branches/B1/activeOrders/O1` | `{ "status": "completed" }` (from waiting) | `PERMISSION_DENIED` |
| 4 | Denial of Wallet (ID) | `/branches/B1/activeOrders/{1MB_STRING}` | `{ ... }` | `PERMISSION_DENIED` |
| 5 | Denial of Wallet (Data) | `/branches/B1/activeOrders/O1` | `{ "tableName": "A".repeat(1000000) }` | `PERMISSION_DENIED` |
| 6 | Orphaned Order | `/branches/NOT_EXIST/activeOrders/O1` | `{ ... }` | `PERMISSION_DENIED` |
| 7 | Immutable Field Update | `/branches/B1/activeOrders/O1` | `{ "orderTime": 12345 }` (modified) | `PERMISSION_DENIED` |
| 8 | Identity Spoofing | `/branches/B1/stockLogs/L1` | `{ "performedBy": "admin_user" }` (by non-admin) | `PERMISSION_DENIED` |
| 9 | Direct PII Access | `/users/data` | (Attempted read by unauthenticated) | `PERMISSION_DENIED` |
| 10| Anonymous Write | `/branches/B1/activeOrders/O1` | (Write by user with `email_verified: false`) | `PERMISSION_DENIED` |
| 11| Zero-Table Order | `/branches/B1/activeOrders/O1` | `{ ..., "tableId": 0 }` | `PERMISSION_DENIED` |
| 12| Arbitrary Data Sync | `/branches/B1/randomCollection/data` | `{ "malicious": true }` | `PERMISSION_DENIED` |

## 3. Test Runner Strategy
We will use `@firebase/rules-unit-testing` or manual validation to ensure:
- Unauthenticated users cannot read/write sensitive data.
- Authenticated but unverified users are restricted to public read-only views.
- Administrators have full access to corrected paths.
- Schema validation helpers (`isValidActiveOrder`, etc.) correctly block malformed data.
