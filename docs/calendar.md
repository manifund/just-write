I'd like to create a calendar of events for Just Write. Key features:

- Events should have a host, a time period, a title, optionally a location, optionally a brief description
- Start with the IRL events in SF. For the writing circles, put down 2 hours from 10am-noon PT at Austin's house (41 Dolores Ter, SF)
- Also add short 15min virtual events before each deadline (the Mondays at 9pm PT) as reminder
- Make it easy for hosts to edit their own event parameters, and transfer ownership to another host.
- Any Just Write member should be able to propose sessions.
- Any member should be able to RSVP (yes/maybe/no) to the sessions; RSVPs are visible to everyone else
  - Members which are RSVP's yes or maybe should get an email notification, 24h before the event
- Set up sync with Google Calendar, so it's easy for members to see all the extant events
  - Maybe: Add all committed users to this google calendar? Or suggest a good UX pattern for this.

The in-app calendar should be well designed (use frontend design skill), with standard views for the month + list view.

Let me know if you have any questions on product or implementation details before starting!

## Decisions (Nov 3)

- Writing circles: Sat Nov 7, 14, 21, 10am–noon PT at 41 Dolores Ter, hosted by Austin. Sat Nov 28 same time, location TBD, Austin as host until handed off.
- Deadline reminders: Mondays 8:45–9pm PT. Calendar markers only, no meeting or link. Members can propose their own virtual sessions.
- Addresses are visible only to signed-in members. `/calendar` is public; everything else (RSVPs, proposing) needs membership.
- Proposed sessions go live immediately. Admins can edit, transfer, or cancel any event.
- Hosts: one owner plus optional co-hosts, all committed members. Any host can edit; the owner can transfer ownership.
- 24h reminder email goes to yes/maybe RSVPs and to the hosts (with a headcount).
- New events and time/location changes are posted to #meetups (the existing #sf channel, renamed).
- Google Calendar: one real "Just Write" Google calendar, written by a service account through the Calendar API so changes show up in seconds. It's shared automatically with every committed member (and their altEmail). RSVPs stay on the site. An ICS feed is offered for non-Google users. (Luma and Partiful both rely on ICS subscriptions, which Google refreshes only every 12–24h.)
