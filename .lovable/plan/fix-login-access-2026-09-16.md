# Fix login access

## What will change
- Make the displayed demo credentials create a persistent demo session instead of only changing pages.
- Teach protected pages and sign-out to recognize and clear that demo session.
- Keep normal Lovable Cloud email/password sign-in unchanged.
- Verify demo login, protected-page access, refresh behavior, and sign-out in the running portal.

## Technical details
- Add demo sign-in state to the shared authentication provider rather than bypassing navigation only.
- Avoid granting demo mode any backend administrator credentials; cloud-backed actions still require a real account.
