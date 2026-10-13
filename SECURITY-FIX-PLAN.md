# Security fixes 9–16

1. Serialize payment decisions on the order row and debt settlements on the customer row. Read balances after acquiring the lock, preserve payment retries, and close an order only once.
2. Serialize PIN and password attempts on the user row. Persist account lockouts, expire them after five minutes, and clear them when credentials are changed.
3. Pass the authenticated user to outlet updates and customer history, and apply the existing outlet access rules.
4. Consume OTPs with conditional database updates so verification happens once and attempts cannot exceed the limit.
5. Recheck stream authorization before emitting events and every second while idle. Limit concurrent streams and release listeners on disconnect.
6. Require a publisher and code signing when building update-enabled Windows releases. Refuse unsigned update configurations at runtime and remove HTTP release feeds.
7. Test using an isolated PostgreSQL instance, the actual Nest application, HTTP requests, and database assertions. Create application records through onboarding, staff, menu, orders, and payment workflows. Do not substitute services or storage with mocks.

The isolated database is disposable. Existing business databases and the untracked brand directory are outside this work. Production release signing requires the owner's signing certificate and CI secrets; no test can establish successful production signing without those credentials.
