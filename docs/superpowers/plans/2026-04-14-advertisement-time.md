# Advertisement Time Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new n8n workflow that posts a random playful Slack message to `#cms-team` roughly twice per week, showing the live count of reviewable community PRs and prompting the team to use `/roll`.

**Architecture:** A single new workflow (`workflow-3-advertisement.json`) with a cron schedule trigger (hourly, Mon–Fri, 9:00–17:00 CET), a probabilistic "Roll Dice" code node (2/45 chance per slot → avg 2 fires/week), a Linear GraphQL fetch for the current reviewable PR count, a message-builder code node that picks one of 50 playful messages and substitutes the count, and a final Slack `chat.postMessage` HTTP call to `#cms-team`. No new credentials needed — reuses the existing `Linear API` (id: "1") and `Slack Bot` (id: "2") credentials.

**Tech Stack:** n8n workflow JSON, Linear GraphQL API, Slack Web API (`chat.postMessage`)

---

## Files

| Action | Path | Responsibility |
|---|---|---|
| Create | `n8n/workflow-3-advertisement.json` | The complete n8n workflow |

---

## Task 1: Create `workflow-3-advertisement.json`

**Files:**
- Create: `n8n/workflow-3-advertisement.json`

This is a single JSON file. Write it in full — no partial scaffolding.

- [ ] **Step 1: Create the workflow file**

Create `n8n/workflow-3-advertisement.json` with the following content. This is the complete, final file — copy it exactly.

```json
{
  "name": "Slack \u2014 Advertisement Time",
  "nodes": [
    {
      "id": "node-schedule-03",
      "name": "Schedule Trigger",
      "type": "n8n-nodes-base.scheduleTrigger",
      "typeVersion": 1.2,
      "position": [250, 300],
      "parameters": {
        "rule": {
          "interval": [
            {
              "field": "cronExpression",
              "expression": "0 9-17 * * 1-5"
            }
          ]
        }
      }
    },
    {
      "id": "node-code-03-dice",
      "name": "Roll Dice",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [470, 300],
      "parameters": {
        "jsCode": "const threshold = 2 / 45;\nreturn [{ json: { send: Math.random() < threshold } }];"
      }
    },
    {
      "id": "node-if-03",
      "name": "Should Send?",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [690, 300],
      "parameters": {
        "conditions": {
          "options": {
            "caseSensitive": true,
            "leftValue": "",
            "typeValidation": "strict"
          },
          "conditions": [
            {
              "id": "condition-01",
              "leftValue": "={{ $json.send }}",
              "rightValue": true,
              "operator": {
                "type": "boolean",
                "operation": "equals"
              }
            }
          ],
          "combinator": "and"
        }
      }
    },
    {
      "id": "node-http-03-linear",
      "name": "Fetch Linear Issues",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [910, 220],
      "credentials": {
        "httpHeaderAuth": {
          "id": "1",
          "name": "Linear API"
        }
      },
      "parameters": {
        "method": "POST",
        "url": "https://api.linear.app/graphql",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ query: '{ issues(filter: { team: { id: { eq: \"a545ae90-ba50-4427-83e6-c0ce7dde9528\" } }, state: { type: { nin: [\"completed\", \"cancelled\"] } } }, first: 250) { nodes { id identifier title url priorityLabel labels { nodes { name } } } } }' }) }}",
        "options": {}
      }
    },
    {
      "id": "node-code-03-msg",
      "name": "Build Message",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [1130, 220],
      "parameters": {
        "jsCode": "const nodes = $input.first().json.data?.issues?.nodes ?? [];\nconst filtered = nodes.filter(issue =>\n  issue.labels?.nodes?.some(l => l.name.toLowerCase().includes('passing'))\n);\nconst count = filtered.length;\n\nconst messages = [\n  'Somewhere, a developer is refreshing their PR page for the 47th time today. {count} PRs are waiting for your eyes. `/roll` to pick one.',\n  'Each community PR reviewed = one open source contributor who doesn\\'t quit forever. {count} are waiting. Don\\'t let them down.',\n  'Fun fact: {count} community PRs were written with love, caffeine, and questionable commit messages. Show them some love \\u2014 `/roll`.',\n  'The universe is vast and cold. But {count} community PRs are warm and ready for review. Be the warmth. `/roll`',\n  'Legend says every unreviewed PR adds a year to a contributor\\'s waiting time. {count} legends are unfolding right now. Break the curse \\u2014 `/roll`',\n  'Scientists confirm: reviewing a community PR increases reviewer karma by 47%. {count} PRs available. `/roll`',\n  '{count} community PRs walk into a bar. The bartender says \\'we don\\'t serve PRs here.\\' Don\\'t be that bartender. `/roll`',\n  'Plot twist: the community PR you review today might fix the bug that\\'s been annoying you for months. {count} available. `/roll`',\n  'Each time a community PR gets reviewed, a developer somewhere finally sleeps soundly at night. {count} developers await. `/roll`',\n  'Unreviewed PRs don\\'t disappear \\u2014 they just get sadder. {count} of them are feeling existential right now. `/roll` and make a difference.',\n  'A community contributor submitted a PR and went to make coffee. They\\'re still waiting. {count} PRs, infinite coffees. `/roll`',\n  'Every great open source project was built on reviewed PRs and broken dreams. Help with the first part. {count} waiting. `/roll`',\n  'Ghost stories for developers: {count} PRs, submitted months ago, never reviewed, drifting through the codebase... `/roll` before it\\'s too late.',\n  'In a parallel universe, every community PR gets reviewed in 24 hours. Be that universe. {count} waiting. `/roll`',\n  'Reviewing a community PR has been scientifically linked to: good vibes, better karma, and at least one contributor not rage-quitting open source. {count} available. `/roll`',\n  'If {count} PRs were pizza slices, that\\'d be a lot of cold pizza. Don\\'t let good contributions go cold. `/roll`',\n  'A contributor pushed their first ever PR to Strapi. It\\'s in that pile of {count}. Be the reason they come back. `/roll`',\n  'The PR queue has {count} items. The coffee machine has 0 excuses. `/roll`',\n  'Somewhere a contributor is telling their rubber duck \\'don\\'t worry, they\\'ll review it soon.\\' The duck is skeptical. {count} PRs. `/roll`',\n  'Community PRs are like plants \\u2014 ignore them long enough and they die. {count} are looking a little thirsty. `/roll`',\n  'Breaking news: {count} community PRs found waiting patiently in Linear. Experts recommend `/roll` as immediate treatment.',\n  'Every unreviewed PR is a tiny cry for help wrapped in a diff. {count} tiny cries. `/roll`',\n  'A contributor spent their weekend on a PR. You could spend 20 minutes on it. {count} are waiting. `/roll`',\n  'Fun activity: `/roll` a PR, review it, feel like a hero. {count} hero opportunities available right now.',\n  'The Strapi community has spoken \\u2014 in code. {count} times. Time to write back. `/roll`',\n  '{count} PRs. One `/roll` command. Somewhere, a butterfly effect of merged code begins.',\n  'Archaeologists in 3024 will discover {count} unreviewed PRs and wonder what went wrong. Don\\'t let them be right. `/roll`',\n  'You ever just want to make someone\\'s day? There are {count} contributors hoping you will. `/roll`',\n  'The queue doesn\\'t clear itself. Trust me, we checked. {count} PRs, zero self-reviewing. `/roll`',\n  'Plot twist: you ARE the senior dev that contributors are hoping will review their PR. {count} are counting on you. `/roll`',\n  'Community PRs are the love language of open source. {count} messages of love, unread. `/roll`',\n  'Every merged community PR is a tiny victory for the open web. {count} victories are pending. `/roll`',\n  'A wise person once said: \\'be the reviewer you wish to see in the world.\\' {count} PRs. Be wise. `/roll`',\n  'Studies show that teams who review community PRs regularly are 100% cooler than those who don\\'t. {count} chances to be cool. `/roll`',\n  'Somewhere a contributor refreshed their PR page again. And again. {count} PRs. End the refresh loop. `/roll`',\n  'Hot take: the best part of open source is the community. The second best part is reviewing their {count} PRs. `/roll`',\n  'If you review a PR in the forest and no one hears it, does the contributor still get a notification? Yes. {count} waiting. `/roll`',\n  'Time is a flat circle. The PR queue is not \\u2014 it has {count} items and it grows. `/roll`',\n  'Each community PR reviewed = one less developer who switches to a competitor\\'s framework. {count} developers on the edge. `/roll`',\n  'The gap between \\'submitted\\' and \\'reviewed\\' is where open source dreams go to question themselves. Close the gap. {count} PRs. `/roll`',\n  'Not all heroes wear capes. Some just type `/roll` and review a PR. {count} hero moments available.',\n  'Fun fact: contributors who get their PR reviewed are 3\\u00d7 more likely to submit another one. {count} future contributors are waiting. `/roll`',\n  'The PR queue is judging us silently. {count} items deep. Let\\'s do something about it. `/roll`',\n  'Dear diary: today I reviewed a community PR and felt genuinely good about it. {count} diary entries waiting to be written. `/roll`',\n  'Confession: {count} PRs have been waiting longer than your last Netflix binge. Priorities. `/roll`',\n  'What if the real treasure was the community PRs we reviewed along the way? {count} treasures await. `/roll`',\n  'In the time it took to read this message, a contributor hit refresh again. {count} PRs. `/roll`',\n  'A PR a day keeps the stale queue away. {count} options. `/roll`',\n  'Open source runs on caffeine and reviewed PRs. We\\'ve got the caffeine covered. {count} PRs need you. `/roll`',\n  'The community built something and trusted us with it. {count} times over. Time to show up. `/roll`'\n];\n\nconst text = messages[Math.floor(Math.random() * messages.length)]\n  .replace('{count}', String(count));\n\nreturn [{ json: { text } }];"
      }
    },
    {
      "id": "node-http-03-slack",
      "name": "Post to #cms-team",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [1350, 220],
      "credentials": {
        "httpHeaderAuth": {
          "id": "2",
          "name": "Slack Bot"
        }
      },
      "parameters": {
        "method": "POST",
        "url": "https://slack.com/api/chat.postMessage",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ channel: '#cms-team', text: $json.text }) }}",
        "options": {}
      }
    }
  ],
  "connections": {
    "Schedule Trigger": {
      "main": [
        [{ "node": "Roll Dice", "type": "main", "index": 0 }]
      ]
    },
    "Roll Dice": {
      "main": [
        [{ "node": "Should Send?", "type": "main", "index": 0 }]
      ]
    },
    "Should Send?": {
      "main": [
        [{ "node": "Fetch Linear Issues", "type": "main", "index": 0 }],
        []
      ]
    },
    "Fetch Linear Issues": {
      "main": [
        [{ "node": "Build Message", "type": "main", "index": 0 }]
      ]
    },
    "Build Message": {
      "main": [
        [{ "node": "Post to #cms-team", "type": "main", "index": 0 }]
      ]
    }
  },
  "settings": {
    "executionOrder": "v1",
    "timezone": "Europe/Paris"
  },
  "active": false,
  "meta": {
    "templateCredsSetupCompleted": false
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add n8n/workflow-3-advertisement.json
git commit -m "feat: add advertisement time workflow"
```

---

## Task 2: Import and test in n8n

No automated tests exist for n8n workflow JSON — validation is done by importing and running the workflow manually.

- [ ] **Step 1: Import the workflow**

In your n8n instance:
1. Go to **Workflows** → **Add Workflow** → **Import from file**
2. Select `n8n/workflow-3-advertisement.json`
3. Verify 6 nodes appear: Schedule Trigger → Roll Dice → Should Send? → Fetch Linear Issues → Build Message → Post to #cms-team

- [ ] **Step 2: Verify credentials are auto-assigned**

Open each HTTP Request node and confirm:
- **Fetch Linear Issues** — credential shows `Linear API`
- **Post to #cms-team** — credential shows `Slack Bot`

If either credential shows as unlinked, open the node, select the correct credential from the dropdown, and save.

- [ ] **Step 3: Test Roll Dice in isolation**

Click the **Roll Dice** node → **Test step**.

Expected output:
```json
[{ "send": true }]
```
or
```json
[{ "send": false }]
```

Run it several times to confirm both outcomes appear (it's probabilistic — run ~20 times to see both).

- [ ] **Step 4: Temporarily force `send: true` and test the full path**

To test the downstream nodes without waiting for a lucky dice roll:

1. Open the **Roll Dice** code node
2. Temporarily replace the code with:
   ```javascript
   return [{ json: { send: true } }];
   ```
3. Click **Test workflow** (runs from Schedule Trigger through to the end)
4. Verify:
   - **Fetch Linear Issues** returns issues from Linear with labels
   - **Build Message** outputs a `text` field with a message and the `{count}` placeholder replaced by a number
   - **Post to #cms-team** receives a 200 response from Slack and the message appears in `#cms-team`

- [ ] **Step 5: Restore Roll Dice and activate**

1. Restore Roll Dice code:
   ```javascript
   const threshold = 2 / 45;
   return [{ json: { send: Math.random() < threshold } }];
   ```
2. Activate the workflow (toggle **Active** to ON)
3. Confirm the workflow shows as active

- [ ] **Step 6: Verify timezone**

In n8n, open the workflow settings (⚙ icon in the top bar) and confirm the timezone is set to **Europe/Paris**. If it's not (some n8n versions don't apply it from JSON), set it manually there.
