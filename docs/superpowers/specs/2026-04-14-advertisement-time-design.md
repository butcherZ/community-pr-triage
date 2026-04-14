# Advertisement Time — Design Spec

**Date:** 2026-04-14
**Feature:** Scheduled Slack nudges to encourage the CMS team to review community PRs via `/roll`

---

## Goal

Post a playful, randomized Slack message to `#cms-team` roughly twice per week, showing how many community PRs are currently waiting for review and prompting team members to run `/roll`.

---

## Architecture

A single new n8n workflow: `n8n/workflow-3-advertisement.json`

```
Schedule (hourly, Mon-Fri 9-18 CET)
  → Roll Dice (Code)
  → Should Send? (IF)
      TRUE → Fetch Linear Issues (HTTP)
                → Build Message (Code)
                    → Post to #cms-team (HTTP)
      FALSE → (end silently)
```

---

## Nodes

### 1. Schedule Trigger
- **Type:** Schedule
- **Interval:** Every hour
- **Days:** Monday–Friday only
- **Hours:** 9:00–17:00 (fires on the hour; 9 triggers per day × 5 days = 45 slots/week)
- **Timezone:** `Europe/Paris` (handles CET/CEST automatically)

### 2. Roll Dice (Code node)
Generates a random float and compares against `2/45 ≈ 0.0444`. Returns `{ send: true/false }`.

```javascript
const threshold = 2 / 45;
return [{ json: { send: Math.random() < threshold } }];
```

Produces an average of ~2 fires/week. Some weeks may yield 1 or 3 — intentional, keeps the timing genuinely random.

### 3. Should Send? (IF node)
- **Condition:** `$json.send` is `true`
- **TRUE branch:** continues to Fetch Linear Issues
- **FALSE branch:** unconnected — workflow ends silently

### 4. Fetch Linear Issues (HTTP Request)
- **Method:** POST
- **URL:** `https://api.linear.app/graphql`
- **Credential:** `Linear API` (Header Auth, id: "1")
- **Query:** Identical to workflow-1 — fetches open, non-completed issues in the CPR team, with labels and CI status. Filters client-side to issues with a label containing "passing" (CI passing + CLA signed).

### 5. Build Message (Code node)
- Filters issues to those with a "passing" label (same logic as workflow-1's Pick Random node)
- Counts the reviewable PRs
- Picks a random message from the pool of 50 (see below)
- Replaces `{count}` placeholder with the actual count

```javascript
const nodes = $input.first().json.data?.issues?.nodes ?? [];
const filtered = nodes.filter(issue =>
  issue.labels?.nodes?.some(l => l.name.toLowerCase().includes('passing'))
);
const count = filtered.length;

const messages = [
  // ... pool of 50 messages
];

const text = messages[Math.floor(Math.random() * messages.length)]
  .replace('{count}', count);

return [{ json: { text } }];
```

If count is 0, still sends a message (the placeholder becomes "0" — messages read naturally with zero too).

### 6. Post to #cms-team (HTTP Request)
- **Method:** POST
- **URL:** `https://slack.com/api/chat.postMessage`
- **Credential:** `Slack Bot` (Header Auth, id: "2")
- **Body:**
  ```json
  {
    "channel": "#cms-team",
    "text": "{{ $json.text }}"
  }
  ```
- Regular (non-ephemeral) message — visible to the whole channel

---

## Message Pool (50 messages)

All messages contain `{count}` which is replaced with the live PR count at send time.

1. "Somewhere, a developer is refreshing their PR page for the 47th time today. {count} PRs are waiting for your eyes. `/roll` to pick one."
2. "Each community PR reviewed = one open source contributor who doesn't quit forever. {count} are waiting. Don't let them down."
3. "Fun fact: {count} community PRs were written with love, caffeine, and questionable commit messages. Show them some love — `/roll`."
4. "The universe is vast and cold. But {count} community PRs are warm and ready for review. Be the warmth. `/roll`"
5. "Legend says every unreviewed PR adds a year to a contributor's waiting time. {count} legends are unfolding right now. Break the curse — `/roll`"
6. "Scientists confirm: reviewing a community PR increases reviewer karma by 47%. {count} PRs available. `/roll`"
7. "{count} community PRs walk into a bar. The bartender says 'we don't serve PRs here.' Don't be that bartender. `/roll`"
8. "Plot twist: the community PR you review today might fix the bug that's been annoying you for months. {count} available. `/roll`"
9. "Each time a community PR gets reviewed, a developer somewhere finally sleeps soundly at night. {count} developers await. `/roll`"
10. "Unreviewed PRs don't disappear — they just get sadder. {count} of them are feeling existential right now. `/roll` and make a difference."
11. "A community contributor submitted a PR and went to make coffee. They're still waiting. {count} PRs, infinite coffees. `/roll`"
12. "Every great open source project was built on reviewed PRs and broken dreams. Help with the first part. {count} waiting. `/roll`"
13. "Ghost stories for developers: {count} PRs, submitted months ago, never reviewed, drifting through the codebase... `/roll` before it's too late."
14. "In a parallel universe, every community PR gets reviewed in 24 hours. Be that universe. {count} waiting. `/roll`"
15. "Reviewing a community PR has been scientifically linked to: good vibes, better karma, and at least one contributor not rage-quitting open source. {count} available. `/roll`"
16. "If {count} PRs were pizza slices, that'd be a lot of cold pizza. Don't let good contributions go cold. `/roll`"
17. "A contributor pushed their first ever PR to Strapi. It's in that pile of {count}. Be the reason they come back. `/roll`"
18. "The PR queue has {count} items. The coffee machine has 0 excuses. `/roll`"
19. "Somewhere a contributor is telling their rubber duck 'don't worry, they'll review it soon.' The duck is skeptical. {count} PRs. `/roll`"
20. "Community PRs are like plants — ignore them long enough and they die. {count} are looking a little thirsty. `/roll`"
21. "Breaking news: {count} community PRs found waiting patiently in Linear. Experts recommend `/roll` as immediate treatment."
22. "Every unreviewed PR is a tiny cry for help wrapped in a diff. {count} tiny cries. `/roll`"
23. "A contributor spent their weekend on a PR. You could spend 20 minutes on it. {count} are waiting. `/roll`"
24. "Fun activity: `/roll` a PR, review it, feel like a hero. {count} hero opportunities available right now."
25. "The Strapi community has spoken — in code. {count} times. Time to write back. `/roll`"
26. "{count} PRs. One `/roll` command. Somewhere, a butterfly effect of merged code begins."
27. "Archaeologists in 3024 will discover {count} unreviewed PRs and wonder what went wrong. Don't let them be right. `/roll`"
28. "You ever just want to make someone's day? There are {count} contributors hoping you will. `/roll`"
29. "The queue doesn't clear itself. Trust me, we checked. {count} PRs, zero self-reviewing. `/roll`"
30. "Plot twist: you ARE the senior dev that contributors are hoping will review their PR. {count} are counting on you. `/roll`"
31. "Community PRs are the love language of open source. {count} messages of love, unread. `/roll`"
32. "Every merged community PR is a tiny victory for the open web. {count} victories are pending. `/roll`"
33. "A wise person once said: 'be the reviewer you wish to see in the world.' {count} PRs. Be wise. `/roll`"
34. "Studies show that teams who review community PRs regularly are 100% cooler than those who don't. {count} chances to be cool. `/roll`"
35. "Somewhere a contributor refreshed their PR page again. And again. {count} PRs. End the refresh loop. `/roll`"
36. "Hot take: the best part of open source is the community. The second best part is reviewing their {count} PRs. `/roll`"
37. "If you review a PR in the forest and no one hears it, does the contributor still get a notification? Yes. {count} waiting. `/roll`"
38. "Time is a flat circle. The PR queue is not — it has {count} items and it grows. `/roll`"
39. "Each community PR reviewed = one less developer who switches to a competitor's framework. {count} developers on the edge. `/roll`"
40. "The gap between 'submitted' and 'reviewed' is where open source dreams go to question themselves. Close the gap. {count} PRs. `/roll`"
41. "Not all heroes wear capes. Some just type `/roll` and review a PR. {count} hero moments available."
42. "Fun fact: contributors who get their PR reviewed are 3× more likely to submit another one. {count} future contributors are waiting. `/roll`"
43. "The PR queue is judging us silently. {count} items deep. Let's do something about it. `/roll`"
44. "Dear diary: today I reviewed a community PR and felt genuinely good about it. {count} diary entries waiting to be written. `/roll`"
45. "Confession: {count} PRs have been waiting longer than your last Netflix binge. Priorities. `/roll`"
46. "What if the real treasure was the community PRs we reviewed along the way? {count} treasures await. `/roll`"
47. "In the time it took to read this message, a contributor hit refresh again. {count} PRs. `/roll`"
48. "A PR a day keeps the stale queue away. {count} options. `/roll`"
49. "Open source runs on caffeine and reviewed PRs. We've got the caffeine covered. {count} PRs need you. `/roll`"
50. "The community built something and trusted us with it. {count} times over. Time to show up. `/roll`"

---

## Credentials

Reuses existing n8n credentials — no new credentials needed:

| Credential | id | Used for |
|---|---|---|
| `Linear API` | "1" | Fetching open CPR issues |
| `Slack Bot` | "2" | Posting to #cms-team |

---

## What this does NOT do

- Does not track which messages have been sent recently (repeat messages are acceptable given the pool size)
- Does not skip firing if the count is 0 (zero is a valid and funny message)
- Does not @mention anyone — just a channel-level message
