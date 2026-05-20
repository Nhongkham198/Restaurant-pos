# Firebase Security Specification

## Data Invariants
1. **Users**: Global collection. Only admins can write. Public read for login purposes (NOTE: This is insecure and should be replaced by Firebase Auth in production).
2. **Branches**: Global collection. Only admins can write. Public read.
3. **ActiveOrders**: Branch-specific. Read/Write by branch staff (pos, kitchen, admin).
4. **PreOrders**: Branch-specific. Customers can create. Staff can read/update.
5. **StockItems**: Branch-specific. Staff can read/update.
6. **StockLogs**: Branch-specific. Staff can create.
7. **LeaveRequests**: Global. Users can create, Admins can update.

## The "Dirty Dozen" Payloads

1. **Identity Spoofing (Users)**: Attempt to update `users/data` to set someone else as admin.
   - Payload: `{ "value": [{ "id": 1, "username": "attacker", "role": "admin" }] }`
   - Target: `users/data`
   - Expected: `PERMISSION_DENIED`

2. **Branch Hijacking**: Attempt to update `branches/data` to change branch ownership/tokens.
   - Payload: `{ "value": [{ "id": 1, "name": "Hacked", "lineMessagingToken": "malicious" }] }`
   - Target: `branches/data`
   - Expected: `PERMISSION_DENIED`

3. **Order Status Manipulation**: Attempt to set an order to `completed` without payment (if logic allows).
   - Payload: `{ "status": "completed" }`
   - Target: `branches/1/activeOrders/order123`
   - Expected: `PERMISSION_DENIED` (unless staff)

4. **Resource Poisoning (Large String)**: Inject 1MB string into menu item name.
   - Payload: `{ "value": [{ "id": 1, "name": "A".repeat(1000000) }] }`
   - Target: `branches/1/menuItems/data`
   - Expected: `PERMISSION_DENIED`

5. **Resource Poisoning (Invalid ID)**: Use a path-poisoned ID.
   - Target: `branches/1/activeOrders/../../../evil_doc`
   - Expected: `PERMISSION_DENIED`

6. **Unauthorized Stock Update**: Customer attempting to change stock levels.
   - Payload: `{ "value": [{ "id": 1, "quantity": 9999 }] }`
   - Target: `branches/1/stockItems/data`
   - Expected: `PERMISSION_DENIED`

7. **Shadow Field Injection**: Adding `isVerified: true` to a user profile.
   - Payload: `{ "value": [{ "id": 1, "username": "user", "isVerified": true }] }`
   - Target: `users/data`
   - Expected: `PERMISSION_DENIED`

8. **Admin Privilege Escalation**: User trying to add themselves to `admins/` collection.
   - Target: `admins/attacker_uid`
   - Expected: `PERMISSION_DENIED`

9. **PII Leak**: Unauthorized user reading `leaveRequests/data`.
   - Target: `leaveRequests/data`
   - Expected: `PERMISSION_DENIED`

10. **State Shortcutting**: Updating a stock log's timestamp to the past.
    - Payload: `{ "timestamp": 0 }`
    - Target: `branches/1/stockLogs/log1`
    - Expected: `PERMISSION_DENIED`

11. **Negative Price**: Adding a menu item with negative price.
    - Payload: `{ "value": [{ "id": 1, "name": "Freebie", "price": -100 }] }`
    - Target: `branches/1/menuItems/data`
    - Expected: `PERMISSION_DENIED`

12. **Cross-Branch Access**: Staff from branch A trying to write to branch B.
    - Target: `branches/2/activeOrders/order1`
    - Expected: `PERMISSION_DENIED`
