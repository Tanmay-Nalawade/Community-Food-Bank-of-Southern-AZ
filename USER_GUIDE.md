# Motor Pool App — User Guide

This app is how staff book shared vehicles, pick up/return keys, and report on trips. Admins manage the fleet and bookings; IT Admins manage accounts.

## Getting an account

1. Go to the site and click **Sign up**.
2. Use your `@communityfoodbank.org` email — other email addresses aren't accepted.
3. Check your email for a verification link and click it. You can't log in until you do.
4. Didn't get the email? Go to **Log In**, try logging in anyway, and you'll be sent to a page where you can resend it.

**Forgot your password?** Click **Forgot password?** on the log-in page, check your email for a reset link, and choose a new password.

## Booking a vehicle (Staff)

1. From the home page, pick a date and time window and click **Book a Vehicle**.
2. Choose an available vehicle and confirm.
3. If it books instantly, you'll get a **KeyCafe pickup code** — use it at the KeyCafe box to get the key.
4. If someone else already has a request in for that same time, yours goes to Transportation for review instead, and you'll be notified either way.

Use the same pickup code to return the key when you're done.

## Managing your bookings (Staff)

Open **Dashboard** in the top menu to see:
- **Current** — what you have checked out right now
- **Upcoming** — booked but not started yet (you can edit or cancel these)
- **Past** — everything before now

For **My Account → Booking History**, see everything you've booked in the last year.

After a trip, use the buttons on your dashboard to:
- **Report Mileage** — end mileage, fuel level, whether you picked up/dropped off food. You never enter a start reading: it's filled in automatically from the vehicle's odometer (the previous trip's end reading)
- **Report Issue** — flag a problem with the vehicle for Transportation
- **Return Vehicle** — a quick optional inspection checklist when you're done (you can skip it)

## Your account

**My Account → your name** lets you update your name/email or change your password. Note your email must stay a `@communityfoodbank.org` address.

If you're an Admin or IT Admin, the same menu lets you **View as Staff** to see the app the way a driver does, then **Return to your view** when you're done.

## For Admins

- **Dashboard** — a quick overview of what needs attention
- **Reservations** — approve, deny, edit, or cancel bookings; see full booking history
- **Vehicles** — add a vehicle (you'll be asked for its current odometer reading, which the first trip starts from; a KeyCafe key is created for it automatically — nothing to set up in KeyCafe yourself), edit details, or view a vehicle's own reservation and mileage history
- **Issues** — see everything reported by drivers, mark reviewed or dismiss
- **Reports** — usage and mileage summaries. To email the **Trip log** (every trip in a date range), pick the From/To dates at the bottom of the Trip log section, enter the recipient's address and click **Send** — reports are not sent automatically
- **Drivers** (in the My Account menu) — a list of staff and their booking activity

## For IT Admins

- **Users** — change someone's role, deactivate an account, or manually mark an email verified if a verification email didn't arrive
- **Activity Log** — a record of logins, logouts, and role changes
- **API Status** — check whether the KeyCafe connection is working, and test it on demand

## Common questions

**"Please verify your email before logging in"** — check your inbox for the verification link, or go to the log-in page and try again to get a resend option.

**"You need to use an email address given to you by the Food Bank"** — only `@communityfoodbank.org` addresses can register or be used on an account.

**A vehicle isn't showing as available** — it may already be booked for that time, or marked Maintenance/Out of Service by an Admin.
