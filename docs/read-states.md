# Read states for Activity and chat

Written Nov 5 in response to Austin in #site. The question: when should a notification on /activity count as read?

## What other apps do

- **X (Twitter)**: Opening the Notifications tab clears the badge. New items are tinted for that visit only, and the next visit shows them as normal. There's no per-item state and no "unread" filter. This is how /activity worked in #42.
- **Facebook / Instagram**: Two separate states. Opening the list marks items **seen**, which clears the badge. Each item stays highlighted until you click it or view the post somewhere else, which marks it **read**. Facebook also has "Mark all as read" and "Mark as unread" on each item.
- **Slack (Activity tab)**: Each mention and thread reply is unread until you see the message. Seeing it can happen in Activity, or by scrolling to it in the channel or thread, so reading in either place clears the other. There's an "Unread" filter, "Mark all as read", and "Mark unread" on any message. The badge counts mentions and DMs, not every thread reply.
- **Discord (Inbox → Mentions)**: Each channel has a read marker, and a mention clears once you've viewed that channel past it. The inbox is basically a list of jump links that you clear with ✓. Channels show a "new messages" line where you left off.
- **GitHub / Linear (Inbox)**: One notification per issue or thread, unread until you open it from the inbox _or_ view the issue directly. Inbox Zero is built on "Done", which archives a notification, and snooze. Unread items look bold or have a dot.

## Patterns that work

1. **Viewing the message anywhere clears it.** The best apps (Slack, GitHub, Linear, Facebook) treat a notification as a pointer to a message. Reading the message in its channel or thread clears the notification, and the reverse is true too. Without this, people have to clear the same thing twice. That's the main problem with both #42 (visiting the page clears everything) and #43 (only a click clears an item).
2. **Keep "seen" and "read" separate.** Opening the list clears the sidebar count right away, so it doesn't nag. Items you haven't actually read stay visibly marked, so the list still tells you where to look.
3. **Don't clear highlights while someone is looking at the list.** Keep the "new" tint for the rest of the visit, as X and Slack do.
4. **Quick ways out:** "Mark all as read", plus an "Unread only" filter once the list gets long. "Mark as unread" is good to have but less important for a club this size.
5. **The badge counts what's important.** Mentions should count more than replies in threads you once posted in. Slack and Discord only badge direct mentions by default.

## Recommendation for Just Write

- **Unread item** = a mention or reply the member hasn't seen in Activity _and_ hasn't seen in its channel or thread.
- **Seen in Activity**: opening /activity marks every item shown as seen, so the sidebar count clears. Items stay tinted for that visit, as in #42.
- **Seen in chat**: opening a channel already sets `reads.lastReadAt`, which covers top-level mentions. Replies need a per-thread marker: a small `threadReads` table (`memberId`, `threadId`, `lastReadAt`) set when the thread pane is open. An item is read if `createdAt <=` the channel marker (top-level messages) or the thread marker (replies).
- **Unread in chat**: optionally, show a dot on threads in the channel view that have replies you haven't read, using the same marker.
- Keep **"Mark all as read"**. Leave out per-item "Mark as unread" until someone asks for it.
- **Optional:** make the sidebar count include only mentions, while replies get the tint without a count.

This replaces the click-to-read state in #43 (`activitySeen.readIds`). Clicking an item opens the thread, which sets the thread marker, so clicking still works without a separate list.
