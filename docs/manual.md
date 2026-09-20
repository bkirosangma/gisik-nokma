# Gisik Nokma — instruction manual

This manual walks you through using Gisik Nokma from the first screen onwards. Nothing is assumed.
Every step says what to click and what you should see afterwards, so that if you see something else
you know straight away that something is different.

Where the product cannot do something yet, this manual says so plainly and tells you what to do
instead. It will not send you hunting for a button that was never built.

---

## Before you start: five things that will save you an afternoon

Read these five. They are the ones that catch everybody.

1. **Sign in with the email link.** It is what the screen opens on, and on this deployment it is the
   way in. A **Phone** tab appears only where SMS delivery is configured, and it is not configured
   here — so the screen does not offer it. (§1)
2. **You cannot create a project unless you are an admin.** An admin — and the owner — get a **New
   project** form on the workspace page; a member or a guest is told why it is not there instead of
   being shown a button that fails. If you are not an admin and your workspace has no projects, there
   is nowhere to put work, and an admin will have to add one for you. (§3)
3. **You can put a job on a person only on the website — and you cannot set a due date anywhere.**
   The website's job panel has an "Assignee" picker. The phone and desktop apps have no Assignee row
   at all, so there you can neither see who a job is on nor set it. Due dates have no control on any
   screen. (§5)
4. **You cannot leave a comment on a job on the website.** The job screen shows the description and
   lets you write one; there is no free-standing box for a comment. The one comment the website does
   take is a **Move's**: a move carrying a "require a comment" rule puts a box on the Move dialog, and
   what you type is recorded on the move. (§5)
5. **Every date in the product is on Indian time**, wherever you are. "Today" changes over at midnight
   in India — which is early evening in the UK and late morning on the American west coast. (§14)

None of these five is something you are doing wrong.

---

## The words on the screen

The product uses a handful of words borrowed from software teams. You do not have to like them, but
knowing what they mean will make every screen easier. This manual uses the screen's own words, so
that what you read here matches what you see.

| The screen says | It means |
|---|---|
| **Workspace** | Your whole business. "Marak Design", "Robert's Plumbing". Everybody and everything sits inside one. |
| **Project** | A bucket of work inside a workspace. "Shop operations". "Residential jobs". |
| **Ticket** | One job. This manual mostly says "job". |
| **Epic / Story / Task / Sub-task** | The four built-in kinds of job, biggest to smallest. An admin can rename these. |
| **Workflow** | Your set of stages that work moves through, and the allowed moves between them. |
| **State** | One stage. A column on the board. |
| **Transition** | One allowed move from one stage to another. |
| **Terminal** | A stage that counts as finished. |
| **Claim** | Something a person said was true, with their name and the time on it. |

---

## §1 — Signing in

There is no password in this product. You do not make one up, you do not remember one, and there is no
box to type one into. If somebody set this up for you and you think you typed a password, it was
almost certainly a one-time code.

### The way that works: an email link

1. Go to the sign-in page.
2. Where SMS delivery is configured the page shows two tabs — **Phone** and **Email link** — and opens
   on Phone. It is not configured on this deployment, so there are no tabs and the page is already on
   the email box. Either way: **use "Email link".**
3. Type your email address into the box.
4. Press **Send magic link**.
5. The screen will say to check your inbox — the link in the email signs you in.
6. Go to your email. You will get a plain message with the link on its own line. Click it.
7. You are signed in. There is no code to copy across and no second window.

### The other two ways that work

Below the email box there are two more buttons:

- **Continue with Google** — the obvious choice if your business email is already on Google.
- **Sign in with a passkey** — this is the fingerprint or face unlock your phone or laptop already
  does. If you have set that up, it is the fastest way in.

If you are getting somebody started for the first time, point them at **Continue with Google**. It is
the one they will recognise.

### The way that does not work: the Phone tab

Where SMS delivery is configured, the sign-in page offers a **Phone** tab and opens on it. Type a phone
number there and press **Send code** and no code will arrive: the product answers with a message saying
sign-in is by email. Nothing is broken on your end and there is nothing to wait for.

It is worth knowing because it is the tab such a page opens on, so it is the very first thing a new
person tries. **This deployment does not configure SMS, so the tab is not offered at all** — see *Before
you start*, item 1.

> **Treat your sign-in link like a password.** Anyone who has that link can get into your account.
> Do not forward it and do not paste it into a group chat. The same goes for invitation links (§4).

### Staying signed in, and signing out

You stay signed in. You will not do this every morning.

When it does eventually run out, you will not get a blank page or a confusing error. The page tells
you your session has ended and takes you to sign in — and once you have, it puts you back on the page
you were trying to reach. If you left the program open overnight and came back to a sign-in screen,
that is what happened. Sign in the same way as before.

The same is true if you click a link (an invitation, or a link to a job) while signed out: it
remembers where you were headed and sends you there afterwards.

To sign out, use the **Sign out** button on the right of the bar at the top of the screen. Signing out
really does end it — the next thing you try on that device is refused immediately, not "at some point
later". That matters if you have signed in on somebody else's laptop.

---

## §2 — Finding your way around

There is a small bar across the top of nearly every screen. It has three things and no more:

- **Workspaces** — the list of every workspace you are in.
- **My Work** — the jobs assigned to you. This only appears once you are inside a workspace.
- **Inbox** — with a small number badge on it when you have unread messages.

Plus your name and a **Sign out** button on the right.

**That is the entire menu.** There is no settings link, no search box, and no help link. The settings
screens do exist (§11 and §12) and nothing anywhere links to them.

### Light or dark

There is a small toggle button that cycles through three settings each time you press it:

1. **System** — follow whatever your computer or phone is set to.
2. **Light**
3. **Dark**
4. …and back to System.

If you pick Light or Dark, the product remembers your choice for next time. If you cycle back around
to System, it forgets your choice and follows your device again.

---

## §3 — Workspaces, and the project problem

### Making a workspace

1. Go to the **Workspaces** page.
2. Below the list of workspaces there is a heading, **New workspace**, with one box labelled **Name**.
3. Type your business name into it. **Type it exactly as you want it** — the product does not trim off
   extra spaces. If you type spaces at the front, that is what gets saved.
4. Press **Create workspace**.
5. If it works, you are taken into the new workspace. If it fails, you are told the real reason in
   plain words. A name of nothing but spaces is refused with "A workspace needs a name."

### What you get

You become the **owner** of that workspace. It also sets you up with:

- A basic set of stages for work to move through — a simple to-do / doing / done arrangement.
- Four built-in kinds of job: **epic**, **story**, **task** and **sub-task**. Those names come from
  software teams and may mean nothing to you. An admin can rename them (§12).

### The project problem

**A brand-new workspace has no projects.** Whether you can make one depends on your role. An **owner or
admin** gets a **New project** form inside the workspace, and that is the only place a project can be
created. Everybody else gets a sentence saying so instead of a button that fails — *"Only an admin can
create a project in this workspace."* For a member the control is not hidden; it is not offered.
Nowhere else creates one: not the Workspaces page, not a settings screen, not the top bar.

Jobs live inside projects. So a workspace with no projects has nowhere to put work.

**What to do about it today:** if you are being set up on Gisik Nokma, ask whoever is setting it up
to put a project there for you. Once a project exists, everything in the rest of this manual works.

### What the Workspaces page shows you

Your name at the top, then a card for each workspace you belong to, with that workspace's projects
listed underneath as links.

- **Click a project name** to open its board.
- **Clicking the workspace name does nothing.** It is a heading, not a link. Only the project links go
  anywhere. This catches people out.

If you belong to no workspace yet, the page says: *"No workspaces yet. Ask an admin for an invite link
— or create your own."* Both of those are real options.

If you have been given a limited role, you may see a workspace's name with no projects listed under
it. **That is deliberate, not broken** — you are being shown your share.

### Renaming a workspace

You can rename a workspace and the new name appears in everybody's list.

> **Worth knowing:** at the moment *anyone* inside a workspace can rename it — including the most
> limited kind of guest. Nobody has yet decided who should be allowed to. It is not a disaster (the
> rename is recorded with a name on it and can be changed back) but it is worth keeping an eye on.

---

## §4 — Getting your people in

### Sending an invitation

1. Inside a workspace, go to the **People** page.
2. If you are the owner or an admin, you will see a form headed **Invite somebody**. (If you are not,
   you will see the list of names and a note saying only an owner or admin can invite people. That is
   correct, not a fault.)
3. Fill in:
   - **Address** — their email address or phone number.
   - **Channel** — a dropdown offering email, sms and whatsapp.
   - **Role** — admin, member or guest. (See below.)
   - **Projects** — this box appears for admin and member, and is hidden for guest.
4. Press **Send invitation**.
5. **The next screen shows you a link, once.** It says: *"Copy it now — it is not stored and cannot be
   shown again."*

> ## Copy that link before you do anything else.
>
> It means exactly what it says. That link appears once, on that screen, at that moment. It is not in
> the pending list. It is nowhere else. Nobody — including you — can look it up again. If you close
> the tab you have to withdraw the invitation and start over.
>
> Paste it into an email to the person **first**, then carry on.

### About the "Channel" dropdown

The dropdown offers email, sms and whatsapp, but **the product does not appear to send the invitation
by any of them.** It makes a link, shows it to you once, and you send it however you like.

So treat "Channel" as a note to yourself about how you intend to reach the person, and plan on sending
the link by hand.

### About the "Projects" box

It asks for a comma-separated list of identifiers — long strings of letters and numbers that you would
have to go and find from somewhere. **In practice this box is not usable by a person.** Leave it
empty.

It is correctly hidden when you pick **guest**, and if you try to invite a guest *and* name projects
it refuses and tells you to share individual jobs with them instead.

### The four roles

| Role | What it means |
|---|---|
| **Owner** | You, if you created the workspace. Sees absolutely everything in the workspace, including jobs shared with only a few named people. There is no way to hide anything from the owner. No way to hand ownership to somebody else was found on any screen, so plan on the founder staying the owner. |
| **Admin** | **A "can change things" role, not a "can see things" role.** This surprises everybody. An admin can invite people and set up stages and job types — but only sees the projects they have personally been put on, same as anyone else. |
| **Member** | Ordinary staff. Does the work. Cannot invite people, cannot change how the stages work. |
| **Guest** | An outsider — a client, your accountant. Sees only the specific jobs somebody has explicitly shared with them. Nothing else. Cannot see the people list. Cannot create jobs. |

**The practical consequence of the admin rule:** if you want somebody to be able to invite people
*and* see the work, you have to make them an admin *and* get them onto the projects. One does not come
with the other.

**You cannot invite somebody as an owner.** That option is not in the dropdown and the product refuses
it if it is forced.

### What the person receiving the link sees

They see the workspace's name and the role they are being offered — even before they sign in. So they
know what they are joining before making an account. It does **not** show them the address the
invitation was sent to, which is right, because links get forwarded.

If they are signed out it says **Sign in to accept** and brings them back afterwards. If they are
already signed in, there is a **Join [workspace]** button.

### Invitations that lapse, get withdrawn, or fail

- An invitation lasts **fourteen days**. (That number is a placeholder nobody has signed off on yet.)
  The pending list shows "Lapses [date]" on each row.
- **One link, one person.** If three people click the same link at the same moment, one gets in and
  the other two see the dead-link message.
- To take an invitation back: the pending list has a **Withdraw** button on each row.

If somebody tells you their link does not work, the message they see is: *"This invitation link does
not open anything. It may have been used, withdrawn, or lapsed — ask whoever invited you for a new
one."*

**That is genuinely all anyone can find out.** The product deliberately refuses to say which of those
four it was, so that nobody can go fishing with random links. Do not waste time diagnosing it —
withdraw it and send a fresh one.

> **Two things to watch for.**
>
> **Withdrawing at the same moment somebody accepts still lets them in.** The invitation shows as
> withdrawn and the person is inside. If you are withdrawing something urgently, check the People list
> afterwards.
>
> **Re-inviting somebody to change their role silently does nothing.** Invite an existing guest to be
> a member: the invitation goes to "accepted" and **they stay a guest**. Nobody is warned, on either
> side.

### Seeing and changing what people are

**You can see, and you cannot change.** The People page lists the people you can see in this workspace,
and names each person's role. That role is read-only: there is no "remove", and no "change role".

Combined with the re-invitation problem above, this means a workspace's people list can drift out of
step with reality and give you no way on screen to fix it. If somebody's role has to change, or
somebody has to be removed, it has to be done another way.

If somebody *is* removed by some other route, it takes effect immediately — on their very next action.
If they are only taken off one project, they lose that project and keep everything else. Their saved
settings are kept for about a month in case they come back.

---

## §5 — Adding a job, and what you can change about it

### Adding a job

1. Open the project you want the job in.
2. Find the **New ticket** button, near the top by the view tabs.
3. A small window opens with three things:
   - **Title** — what the job is. "Fix Mrs. Patel's leaking pipe."
   - **Type** — what kind of job this is, from your workspace's list.
   - **Parent** — which bigger job this sits under. It defaults to **None (project root)**. Leave it
     alone unless this job is part of a bigger one (§6).
4. Press **Create**.

**On the title:** a blank title, or one that is only spaces, is refused. But extra spaces around real
words are kept exactly as you typed them, so check what you typed if you are fussy about tidiness.

**If the New ticket button is not there:** see §8 on the 2,000-job ceiling.

### What you can change afterwards

Open a job by clicking it on any of the job tabs — the Backlog, Board, List, Calendar or Timeline. You
get a panel with two tabs: **Details** and **History**.

On the Details tab you can do **two things**:

1. **Move it to another stage** — the **Move…** button. (§7)
2. **Change who can see it** — the "Who can see this" section. (§10)

Everything else on that panel is there to read, not to change. You will see the title, the current
stage, the assignee, any fields, and the description — all of them showing who claimed the value and
when, and none of them editable.

### The things you cannot do to a job

This is the honest list. Each one is an absence, not a hidden button.

- **You cannot put a job on a person on the phone or desktop apps — on the website you now can.**
  This one is kept here rather than deleted, on the description row's precedent below, so a reader who
  remembers it as an absence finds the correction where they last saw it. **On the website the panel's
  "Assignee" row is a picker:** choose a person, or choose **Unassigned** to take the job off somebody.
  It stays read-only in exactly two cases, and the row itself says which — the workspace roster has not
  loaded, or the job is on a person outside the roster you can see. **On the phone and desktop apps
  there is no "Assignee" row at all**, so there a job's assignee can be neither read nor set.
- **You cannot set a due date or a start date.** (See the box below for the one thing that comes
  close, and why it is not a substitute.)
- **The description is no longer on this list — you can write it now.** It is kept here, rather than
  deleted, so a reader who remembers it as an absence finds the correction where they last saw it.
  Type into the description on the job panel and save it; the panel reads back who set it and when.
  The same box handles formatting and mentions; dropping a file into it is refused rather than
  quietly lost.
- **You cannot leave a comment on a job.** The writing box takes a description and not a comment, and
  nothing on the web shows a comment thread. **The one comment the website does take is a Move's** — a
  move carrying the "require a comment" rule puts a box on the Move dialog (§7), and what you type is
  recorded on the move rather than shown back as a thread. **The phone app has a Comment button on a
  job and the website does not.**
- **You cannot attach a file to a job.** There is no attachment list on the web job sheet, and a file
  dropped into the description box is refused rather than quietly lost. **The one upload the website
  does take is a Move's** — a move carrying the "require evidence" rule puts a file box on the Move
  dialog and stays blocked until the server has stored the file (§7).
- **You cannot rename a job.**
- **You cannot delete a job.** If your stages include a "won't do" or "cancelled" stage, moving it
  there is the nearest thing available.
- **You cannot move a job to a different project.**

> **The one place the product will take a field value from you — and what it will not take.**
>
> If somebody has put a **"Require a field to be set"** rule on one of your moves (§11), the Move
> dialog puts a box on screen for that field and will not let the move through until you fill it in.
> What you type is recorded as your claim. That is currently the only place in the whole product that
> accepts a field value typed by a person.
>
> **It will not get you a due date.** The box is a plain typing box, and the built-in "needed by" and
> "start" dates do not accept plain typed text — they expect a day *and* an optional note about it,
> together, and there is no way to type that into one box. Try it and you will be refused with
> something like *"Due date needs a day in YYYY-MM-DD form (a note is optional)."*
>
> **It will accept a custom date field** your admin created, if you type the day as four-digit year,
> two-digit month, two-digit day — `2026-08-30`. That claim will show up as a marker on the Calendar
> and the Timeline, labelled with your field's name.
>
> **But it is not the same thing as a due date.** A custom date only ever draws a marker; the bar
> across the calendar still needs the two built-in dates, and the "due soon" attention list and Inbox
> message only ever look at the built-in due date. So a custom date will show you a day on a calendar
> and it will not chase anybody.
>
> Worth knowing about. Not worth building a process on.

### Why it shows who claimed everything

You will notice that nothing is shown as a bare fact. Instead of a due date reading "30 Aug 2026", it
reads 30 Aug 2026 and whose claim that is.

That is deliberate and it runs all the way through. Nothing on screen is a property the job just
happens to have; it is always somebody's claim, with their name and the time on it. It is a little
more to read. It also means you are never left guessing who is responsible for a number.

### The History tab

Every change ever made to that job, in order, each one saying who did it and when.

Two things to know:

- **It shows two times for each entry.** One is what the person's own device thought the time was.
  The other is what the product's own system recorded. Usually they match closely. When they do not —
  a wrong clock, or a change made offline that only reached the system hours later — you see both,
  labelled, rather than one made-up time.
- **It stops at 200 entries**, saying so at the top. There is no way to page further back. For a job
  with a very long history, the older part is currently unreachable.

---

## §6 — Jobs inside jobs

You can put a job underneath a bigger job. "Rebrand for Kalita Tea" as one big item, with "Logo
drafts", "Colour palette" and "Print proofs" underneath it.

To do it: pick the bigger job in the **Parent** dropdown when you create the new one. A job can have
only one parent.

The parent then shows progress across its children — **"3 of 5 done"**.

### The rule about which job can go under which

A job's type has to be a *smaller* kind of thing than its parent's type. Each type has a rank number:
**rank 1 is the biggest**, and bigger numbers mean smaller pieces. A child's rank has to be strictly
bigger than its parent's.

So: a task can go under a story, a story under an epic. But you cannot put an epic under a story, and
you cannot put two things of the same rank inside each other.

If you get this wrong, the message says so plainly, naming both types — something like "a ticket's
parent must be a bigger kind of work". Once you understand ranks it makes sense. Before you do, it
reads like nonsense.

### "This needs a parent"

Any job type at the very bottom rank **must** have a parent. That is what the bottom rank is for — it
is the "part of something bigger" level. Sub-task is there by default.

If you want standalone jobs, use a type that is not at the bottom.

The message tells you this using your own type's name, and once you give it a parent it accepts
straight away.

### Other rules you will meet

- **A parent has to be in the same project.** You cannot reach across into another project.
- **You cannot make a loop.** A under B under A is refused, including the clever cases where somebody
  has reordered the ranks to try to make it legal.
- **A parent cannot be marked finished while any of its children is still going.** All of them have to
  be done first. This is the one rule that sits above every workflow and cannot be turned off — you
  will see it named in the stage editor as a fixed system rule.

### "5 of 8 done · 2 restricted"

Five of its eight children are finished, and two of those eight are hidden **from you** — not from
everybody, from you, because of who can see what.

The product could have quietly said "5 of 6" and made the job look nearly finished. It gives you the
true total and tells you part of it is not yours to see. If nothing is hidden, it does not print the
"restricted" part at all. If a job has no children at all, no progress number shows — not "0 of 0",
just nothing.

### "Restricted parent — exists, but you can't see it"

This means the job really does belong to a bigger job, and you are not allowed to see what that bigger
job is — not even its title. The product deliberately tells you a parent *exists* rather than making
the job look like it has none, because those are two different truths.

If a job genuinely has no parent, it says **"At project root"** instead — a different sentence, so the
two can never be confused. If there is a whole chain of hidden parents above, you are only ever told
about the one directly above.

### Seeing a job's children from its panel

Open a job and its panel carries a **Subtasks** section, sitting between the progress line and the
fields. It has four parts.

**The heading** reads "Subtasks", and when the job has children it carries their progress on the same
line — **"Subtasks · 3 of 5 done"**, with **"· 2 restricted"** added when some of them are not yours to
see.

**The children**, one line each, with **each child's own stage** beside it: *"Order the brochures ·
To do"*. A subtask is a job in its own right — it gets a stage, an assignee, a date and a history of
its own. If a job has no children at all, the section says so plainly rather than leaving you an empty
space to interpret.

**When a job is itself a subtask**, the heading also carries a chip naming its parent — **"Subtask of
Rebrand for Kalita Tea"**. Press it and that parent's panel opens in place of the one you were reading.
It names the parent directly above and never a whole chain: the parent's own panel draws its own chip in
turn, so you walk a family tree one step at a time rather than being handed a path. If the parent is one
you are not allowed to see, the chip reads **"Subtask of a restricted parent"** instead and is not
pressable — see "Restricted parent — exists, but you can't see it" above.

**The add row** at the bottom of the section takes a **New subtask title** and files the new child under
the job you are looking at. It is the ordinary "adding a job" you already know (§5) with the parent
filled in for you, so the new child starts in the first stage of its workflow and its title is held to
the same rule as any other: blank, or spaces only, is refused. A refusal keeps what you typed, so you
correct it rather than retype it.

**One refusal worth knowing about.** The heading's count comes from the server; the list itself comes
from a separate read. If those two ever disagree — the server counts five children you can see and only
three could be read — the section **shows you no list at all** and says so in the server's own numbers.
It will not quietly show you three and let you assume that is all of them.

### Adding work under a job that is already finished

The product will not quietly tack an unfinished step onto a finished job. Instead it does the best
thing in the whole product:

1. It tells you the parent is in a finished stage, and **offers to reopen it for you**. You get a box
   headed **"Reopen parent?"** naming the finished job and its state.
2. It gives you a picker of the stages you could reopen it into — only ones that are genuinely
   reachable from where it is and genuinely not finished. You will never be offered "reopen into
   Done".
3. Press **Reopen and proceed**. The parent is reopened first, then your new job is filed under it.
4. Press **Cancel** and nothing at all is sent.

If it does not go smoothly, it tells you exactly what happened:

- If the reopen itself is refused (you are not allowed, or a comment is required), your new job is
  **not** created, and you are told why.
- If the reopen works but your job is still refused for some other reason, you are told **both**
  things — that the parent really was reopened and that is now permanent history, *and* why the job
  was refused. Nothing is quietly undone behind your back.
- If your stages declare no way out of that finished stage at all, it says so plainly with the button
  greyed out — not an empty dropdown you have to interpret.

---

## §7 — Moving a job through its stages

1. Open the job.
2. On the Details tab, press **Move…** next to the current stage.
3. A window opens headed **Move ticket**, with a picker of stages.
4. Pick where you are sending it.
5. Depending on the stage, you may be asked for more before it will let you go ahead. See below.
6. Press **Move**.

### Why the picker only shows some stages

Because your workflow decides which moves are allowed. A job can only go where an arrow leads from
where it currently is. If "Draft" only has an arrow to "With client", that is the only option you get.
It will not show you a move that would be refused anyway.

### The things a move can ask you for

There are exactly five rules that can be put on a move, and no more.

**1. It asks for a comment.**
That move has a "require a comment" rule on it. The box appears only for moves that need it, labelled
*"Comment (required by this transition)"*. The Move button stays greyed out until you type something
real — spaces do not count. You cannot skip it.

**2. It asks for "Evidence".**
This rule means you must attach a file before the move is allowed — a signed-off proof, a delivery
note. The box is labelled *"Evidence (required by this transition)"*, and the Move button stays greyed
out until the upload has finished and the server has stored the file. If the server will not keep the
file you chose — too large, or a kind it does not accept — it says so beside the box and the move stays
blocked.

> **This was broken until 2026-09-19, and the old advice here was to never use the rule.** The box said
> *"Evidence upload is not available in this build yet"* and a move carrying the rule could not be made by
> anybody, ever. That is fixed. The rule is now worth exactly what it looks like: **a move that cannot
> proceed until a file is attached.**

**3. It asks you to fill in a field.**
A "require a field to be set" rule. It only asks for fields that are not already filled in — it will
not make you re-state something a colleague already claimed. What you type is recorded before the
move, so the rule sees it. (This is the workaround described in §5.)

**4. It will not let you make the move, but a colleague can.**
Somebody has put a "restrict who may move it" rule on that step — limited to a role, to whoever the
job is assigned to, or to specific named people. The refusal names who *is* allowed and says you are
not among them.

The product does not try to guess in advance whether you are allowed. It shows you the option and lets
the server answer, so you find out by trying. Not ideal, but it is never wrong.

**5. It says you cannot approve this because you are the one who submitted it.**
The "require a different person" rule, sometimes called *four eyes*. Whoever made the earlier move
cannot be the one who makes the approving move. Somebody else has to do it. If nobody has ever made
that move on this job, there is nobody to compare against and it does not block the first time.

### Two refusal messages at once

Sometimes you will see two messages on screen, and they may disagree. One starts **"instant check — "**
and one starts **"Refused by the server — "**.

- **"instant check"** is your own computer having a quick guess from what it has locally.
- **"Refused by the server"** is the actual answer.

When they disagree, **both stay on screen** rather than one being tidied away. It is confusing the
first time. The alternative is worse: your own machine cheerfully saying "fine" and then the real
answer being no. Read the second one as the answer.

### Moves that work from anywhere

Some workflows have a move set up to work from *any* stage — usually a "reopen" of some kind. If there
is no direct move from where your job is to where you want it, but a "from anywhere" move to the same
place exists, the product uses that automatically. Its rules are still enforced in full; it is not a
back door.

### If the move works, and if it does not

If it goes through, the box closes, the job shows its new stage, and any earlier refusal message is
cleared. If the system answers with nothing at all, it says so — *"The server returned no answer for
this change."* — rather than pretending it worked.

### Somebody changed the stages after my job was created

Your job stays on the version of the workflow it was pinned to when it was created. It is not silently
rewritten to follow a new one.

If a stage your job is sitting in gets removed in a later version, whoever removed it had to say where
those jobs go, and yours follows that. If nobody said, your job refuses to move rather than the
product guessing, and it tells you it is stranded.

---

## §8 — Looking at the work

A project has five tabs: **Backlog**, **Board**, **List**, **Calendar** and **Timeline**. Board is what a
project opens on the first time you look at it; after that it remembers the tab you were last on in that
project and opens there.

### Backlog

The first tab, and where a new job starts its life. It lists the jobs that have not begun, in an order
you arrange — drag a row, or use the **Move up** and **Move down** buttons on it. Each row also has a
**Start** button that moves that job into its workflow.

It does not leave closed jobs out, unlike the Calendar and the Timeline below. When it is empty it says
so: *"Nothing in the backlog — new tickets land here."*

### Board

Columns, one per stage, with cards in them. You do not drag cards — you open one and press Move (§7).

A card shows the title, who it is on, whether it is blocked, its progress, and a small "who · when"
button. Press that button and it tells you who moved it and when: *"marked Doing by Anselma Marak on
19 Aug 2026"*.

Columns are grouped by which set of stages they belong to, so if two job types use different
arrangements you get two clearly separated groups rather than one confusing mess.

**"Blocked" is a property of the column, not of one job.** Whoever built your workflow can mark a stage
as a waiting or blocked one — "Waiting on parts", "Waiting on customer". Every job in that column is
in that state by definition. There is no switch you flip on an individual job to say it is stuck; you
need a stage built for it.

**If the board is empty** it says *"No tickets here yet — create one."* Note the exact wording: it says
"no tickets", not "no columns", because the product genuinely cannot tell "there is no work here" from
"none of it is visible to you", and that sentence is true of both.

If you are a member of the workspace but not on that project, an empty board is the correct answer,
not an error.

### List

A table. You choose two things:

- **How to group it** — by epic, status, assignee, type, or flat (no grouping).
- **Which columns to show** — from status, assignee, due date, type, progress.

Grouping only rearranges. It never hides a row and never changes the counts — the summary at the top
("4 tickets · 1 done") stays the same however you regroup or collapse. Things with nothing to group
under get an honest bucket: **"No epic"**, **"Unassigned"**. They do not vanish.

**"Recently assigned"** is a strip pinned at the top: only your own assignments, newest first, ordered
by when the *system* recorded them so a wrong laptop clock cannot jumble it. A job in that strip also
appears in its normal place further down, so you will see it twice. That is intended.

**"default arrangement — you have not arranged this project"** is a note telling you that what you are
looking at is the default, not something you chose. Once you pick your own grouping or columns, it
goes away. If you have only chosen one of the two, it says so about just that half.

You cannot choose a sort order. Lists come back in a fixed, repeatable order.

### Calendar

A month grid, drawn **only from days somebody actually claimed**. Nothing is estimated or guessed.

- Both a start and a needed-by date → a bar spanning those days.
- Only one date → a single marker, not a bar.
- A start claimed *after* the needed-by → two markers and no bar. It shows you the contradiction
  rather than quietly fixing it. That is your cue to go and fix the dates.
- No dates at all → not on the calendar.

Custom date fields your business set up appear here too, on the same terms, labelled with the field's
own name.

There is a legend with one switch per custom date field that actually claimed a day in the month you
are looking at. Switching one off only hides it from view; it changes nothing about the job.

**Closed jobs are hidden here until you ask for them.** The Calendar and the Timeline both leave closed
work out; the List and the Backlog do not, and the Board never shows them at all. So a month can look
emptier than the project really is.

There are two ways to get them back, and only two: set **Closed** to *closed only* in the Filters
sheet, or leave Closed alone and remove the **Closed: hidden** chip that the strip shows while this
default is on. **Watch that chip.** Set **Closed** to *not closed* and you get a chip with the *same
name* whose **×** only undoes your own setting — the default takes over again and closed jobs stay
hidden. *Everything* on the Closed control is not a third way back, because *everything* and *never
touched it* are the same setting here; that is why the chip exists at all.

**If the calendar looks empty**, it says either *"No claimed dates fall in this month"*, or — when the
only thing hiding your claims is a date field you switched off in the legend — a sentence saying so.

**And the first of those two is wrong more often than it looks.** A month emptied by your own filter, or
by closed jobs being hidden, still gets *"No claimed dates fall in this month"*. Trust the count in the
strip instead: *"8 of 12 shown"* means four jobs are there and something is hiding them.

### Timeline

The same idea stretched sideways over weeks, moving four weeks at a time with **Earlier** and
**Later**. A bar again needs both a start and a needed-by. Anything with only one date, no dates, or a
contradiction goes into a side list beside the chart, with a heading saying which of five reasons it
is there for.

**Closed jobs are hidden here too, on the same terms as the Calendar** — the two ways back, and the
chip it is easy to mistake, are described in that section above.

### The one filter

In the controls row above the tabs, beside the **Filters** button, there is a single switch:
**"Only tickets in progress"**.

Turn it on and you get a note: *"the list, calendar and timeline are asking only for tickets in progress
— not started and done are both excluded. The board is not narrowed."*

> **Read that last sentence carefully.** The switch **does not affect the Board** — and a project opens
> on the Board the first time you look at it. So you can turn it on, read "done are excluded", and be
> looking at a Done column full of done cards. The note exists precisely because of this.

That switch is not the only filter on the website — beside it sits a **Filters** button, and above the
tabs there is a **Search the board** box that narrows what the board shows you.

The deep search is a different thing again: the one that looks through every title, description and
comment in the workspace at once is on no screen at all. It is a finished engine with no steering wheel
bolted on.

### The Filters sheet

The **Filters** button in that controls row opens a sheet over the page. It sets the same filter the
search box and the removable chips read — not a second one — so nothing here waits for an **Apply**.
Every click takes effect at once.

Six things can be set, in this order:

- **Assignee** — one row per person in the workspace, with their picture and their name.
- **Collaborators** — the same rows again. (This is the one that does not narrow anything yet — see the
  last paragraph of this section.)
- **Type** — the job types your workspace has set up.
- **State** — the stages this project's board is built from.
- **Closed** — one control, for jobs that are closed.
- **Category** — **Open**, **Active** or **Terminal**.

Every value is a single button, and each click moves it on one step:

| what you clicked | what shows |
|---|---|
| an empty circle | nothing is being filtered on this value |
| a tick, and **included** in the button's name | only jobs with this value |
| a slash through the circle, **excluded** in the name, and the name struck through | jobs with this value are hidden |

A third click puts the empty circle back.

Two of the six are not lists of your workspace's own values. **Closed** is a single control, so its
three settings read *everything*, *closed only* and *not closed*. **Category** is always the same three
words. The other four are built from what your workspace actually has.

On the **Calendar** and the **Timeline**, *everything* is not enough to get closed jobs back — those
two tabs hide them until you either remove the **Closed: hidden** chip the strip is showing or set
*closed only*. See the Calendar section above.

**If the roster cannot be shown, the sheet says which of three things happened.** One that has not
loaded yet, one that could not be loaded, and a workspace with nobody in it are three different facts,
and it keeps them apart rather than handing you an empty panel.

The footer has two buttons. **Clear all** empties everything you have set, the search box's own text
included, and does not close the sheet — so you can see what it did. **Done** closes it and changes
nothing else.
**Escape** also closes, and puts your keyboard focus back on the **Filters** button; clicking outside
closes without moving your focus at all.

**What you set appears under the tabs**, in the strip that counts how many jobs are showing, as a chip.
Each chip carries an **×** that clears everything that one chip names — so if you included two
assignees and they show as a single chip, the **×** takes both, not one.

Two things never become a chip, and both say so in words instead. **Collaborators is the one thing no
tab applies** — the strip's own sentence is *"Not applied on the board: collaborator."* You can set it
and the filter keeps it, but nothing narrows by it. **Closed shows no chip on the Board either**,
because the Board never shows closed jobs in the first place: there the sentence reads *"Not applied
on the board: closed."*, while the other tabs do give it a chip. Both sentences are the product telling
you, rather than quietly ignoring what you asked for.

### Very large projects

There is a ceiling of **2,000 jobs in a project**. Past it, the **Backlog, List, Calendar and Timeline
all refuse** rather than showing you part of a project pretending to be the whole one. **The "New ticket"
button disappears too**, because it reads from the same place — so a project that grows past the
ceiling becomes one you cannot add to.

The way out is the **"Only tickets in progress"** switch — narrowing gets you back under the ceiling
— and it is deliberately placed where you can still reach it from the refusing screen. The Board keeps
working throughout.

### Two of you looking at once

Yes, and you see each other's changes live without refreshing. The product keeps a connection open.

When you connect, it first catches you up on what you missed, then tells you you are up to date, then
feeds you changes as they happen. If the connection drops it reconnects on its own and picks up where
it stopped rather than downloading everything again.

You can have it open on a laptop and a desktop at once, but only a small number of connections per
person. Past that you are told you have too many, and closing one frees a slot straight away.

---

## §9 — What needs attention, and the Inbox

### The "Needs your attention" strip

A row at the top of My Work, headed *"Needs your attention"*, with four kinds of thing, in this order:

1. **Blocked** — sitting in a stage somebody flagged as blocked.
2. **Stale** — has been sitting in the same stage too long.
3. **Due soon** — a claimed deadline coming up.
4. **Contested** — a claim somebody disputed; its sentence is the rule's own reason for refusing it.

Each one carries its own sentence, so you never have to guess why it is there: *"In an active state
since 2026-07-10 — past the 7-day staleness threshold."* or *"Needed by 2026-08-30 — due within 7
days."*

**If nothing needs attention, the strip does not appear at all.** No box, no "all caught up" message,
nothing. That is deliberate — an empty box headed "Needs your attention" reads like an all-clear you did
not earn. A blank space there is the normal way of saying "nothing needs you right now".

**Changing the thresholds:** if you are the owner or an admin you can change both numbers — how long
"sitting too long" is, and how far ahead "due soon" looks. Both default to seven days, and if nobody
has set them the screen says nobody set them rather than pretending seven was a choice. Blocked is not
affected by either number: blocked is blocked.

### The Inbox

Exactly five kinds of message, and no more. The list is deliberately closed — nothing can quietly add
a sixth kind.

1. Somebody assigned something to you — *"Anselma Marak assigned this to you"*
2. Somebody mentioned you — *"Anselma Marak mentioned you"*
3. A change of yours was disputed — *"Your claim was contested — [the rule]"*
4. A claimed date is coming up
5. Something has been sitting in one stage too long — *"In Doing since 21 Aug — moved there by
   Anselma Marak"*

**To mark one thing read: click the row.** If the marking fails, it reloads to show you the truth
rather than leaving a fake "read" mark. Clicking also takes you to the job it is about.

**To mark a pageful read at once: the `Mark N read` button**, above the list, where **N** is how many
rows on screen are actually unread. It marks exactly those — not your whole Inbox — which is why the
button carries a number instead of the word "all", and why it is simply **not there** when nothing on
screen is unread. A number you can check beats a word you have to take on trust.

When it works, a message appears with an **Undo** beside it — *"3 notifications marked read"*. The Undo
puts back exactly what that one action changed and nothing else, including correctly leaving alone any
row that was already read before you pressed it. If nothing actually moved, no message appears at all,
because there would be nothing to undo.

**Three limits worth knowing.** The message clears itself after about fifteen seconds. Pressing
`Mark N read` again replaces it, so once you start a second action the first one's Undo is gone — there
is only ever one on screen. And a single press carries at most **100** notifications: past that the
whole press is refused and tells you so, rather than marking some of them and leaving you to work out
which ones went.

**The unread badge** on the Inbox link refreshes about once a minute. If a refresh fails it keeps the
last number rather than resetting to nothing, and it shows nothing at all before the first answer
comes back — an absence, not a zero.

**If your Inbox is empty** it says so properly, and the sentence doubles as an explanation of what the
Inbox is for: *"Nothing in your inbox. You will be told here when someone assigns you a ticket,
mentions you, contests a claim, or a claimed day comes near."*

**If there is more than fits**, a **Load more** button appears — only when there genuinely is more. New
pages get added below rather than replacing what you were reading, and if loading fails your existing
rows stay put and you get a retry.

**If you click a message and the job will not open:** *"That ticket cannot be opened from here — it may
have been removed, or it is no longer visible to you. The message itself is yours and stays."* That
last part matters — the message does not disappear just because you lost access to what it was about.
The notice clears itself next time something opens successfully.

### Nothing leaves the app

> **There is no email, no text message, no WhatsApp message and no phone alert about anything that
> happens in your work.** The only email Gisik Nokma sends is your sign-in link.
>
> The email / sms / whatsapp options on the People page are for **inviting** people. They have nothing
> to do with day-to-day notifications.
>
> This means **nobody finds out about anything unless they open the app and look at the Inbox.** For a
> business where people are in and out all day, plan around that. There is no weekly digest either.

---

## §10 — Who can see what

### Setting who can see a job

Open the job. On the Details tab there is a section headed **"Who can see this"** with four choices:

- **Everyone in the workspace**
- **Everyone on the project**
- **Only the people I name** — a checklist of your workspace's people appears; tick who you want.
- **Inherited from the parent** — whatever the job above it decided.

Under every one of those, all the time, there is a line: *"Visible to: these people — and the workspace
owner, always."*

That line is a fact, not a caution. **The workspace owner can always see every job, whatever you set
here.** It is shown on every option — not only the private one — because showing it only there would
let people assume the other options exclude the owner.

### Who is allowed to change it

A project admin **of that job's project**, or whoever created the job. Being an admin of a different
project does not help. If you are not one of those, the product will let you fill the form in and the
server will refuse it, telling you why.

### How it flows down

If you set a big job to "only the people I name", the smaller jobs under it follow **as long as they
are set to inherit**. Anything that has set its own audience keeps it, and everything under that keeps
it too.

Move a job to a new parent and it takes the new parent's audience, along with everything under it.
Move it up to the top and it falls back to the project default. Set it back to inheriting and it and
everything below re-attach.

### Locking yourself out

If you pick "only the people I name" and leave yourself off the list, you get a warning:

> *"You are about to lose access to this ticket. A project admin — or the workspace owner, who always
> sees — can restore it."*

**And then it does exactly what you told it to.** It does not quietly add you back behind the warning.
That is the right choice — silently adding you would file a claim in your name that you never made —
but it means you have to actually read the warning. You cannot apply an empty list; the button stays
off.

### The gap: you cannot read the setting back

**You can set who sees a job. You cannot see what it is currently set to.** On the one screen whose
entire subject is who can see what, the current audience is shown as unavailable rather than guessed.

Guessing would be much worse. It is still a real hole in a feature about sharing. **Keep your own note
of what you set**, at least until this is fixed, because the screen will not remind you.

### What hidden looks like from the other side

Nothing. It simply is not there. There is no "you don't have permission" screen for hidden work —
hidden means invisible.

If somebody goes looking for it directly, they get exactly the same "not found" as they would for a
made-up reference. That is deliberately identical, so that nobody can work out what exists by watching
which refusals they get. The same is true of a job's history and of trying to change one.

If you have access to no jobs in a project at all, the list just looks empty to you — indistinguishable
from a genuinely empty project.

### Guests

A guest sees only the specific jobs somebody explicitly shared with them. Not the project, not the
workspace's other work. They see the workspace's name and an empty project list — which is intended,
not broken.

They *can* see a child of something shared with them, if that child inherits. They cannot open the
people list. They cannot create jobs. If a guest is looking at a job that somebody else is assigned to,
that person shows up as an identifier rather than a name — not blank, just not a name. Slightly ugly,
and better than leaking your staff list to an outsider.

### What you cannot hide

**Who did what.** History always shows who acted and when, untouched, to anybody entitled to see the
job — even when that person shares no project with you. You can hide the *work*. You cannot hide *who
acted*.

Nor can anybody act under your name. That is refused outright, even for the owner, and it is checked
before anything else.

---

## §11 — Setting up your own stages (owners and admins)

### Getting to the screen

**Nothing in the app links to it.** There is no settings entry in the top bar. The stage builder and
the job-type editor can only be reached by typing their address into the browser bar.

That is the honest answer, and it is a real problem — these are the screens that make the product
yours, and they are invisible. Ask whoever set your workspace up for the addresses and bookmark them.

### Who can use it

Owners and admins only. If a member goes there they get: *"You can look, not touch — only a workspace
owner or admin can change workflows and ticket types."* No "New workflow" button, all the boxes
switched off. They can look, they cannot break anything, and there is no way to accidentally publish.

### Starting from a template

You do not have to draw one from scratch. There are three templates plus a blank:

| Template | What it is |
|---|---|
| **Simple kanban** | To do, doing, done. No rules — anything moves along the arrows. **Start here.** |
| **Approval chain** | Draft, submit, approve — with four eyes: whoever submitted cannot be the one who approves. Good for anything a client signs off. |
| **Errand with waits** | Has a "Waiting" stage marked as blocked, for when you are stuck on somebody else. Useful if your work has waiting periods. |
| **Start blank** | An empty canvas with one starting stage called "New". |

Press **Use this template — [name]** and it copies it in. You then get your own independent copy — it
does not stay linked to the template, and changing yours affects nobody else's. You can change it
before publishing.

> The **Errand with waits** template deliberately trips two of its own warnings, because it is modelled
> on a real shop's real process, warts included. That is expected. Do not panic when a template warns
> about itself.

### Building one

It is a drawing canvas. Each stage is a box. **Add state** makes a new one. Each box has:

- **A name** you type.
- **A Category** dropdown — whether that stage counts as *not started*, *in progress*, or *finished*.
- **A blocked tick box** — for stages that mean "we are stuck waiting on someone".
- **A start marker** — which stage new jobs begin in.

**To connect two stages, drag from the edge of one box to the edge of another.** That makes an arrow,
which means "a job can go this way".

Boxes and arrows are not hard. It is the vocabulary around them that trips people, not the drawing.

> **Get Category right.** It is the one bit of setup where getting it wrong quietly breaks things
> elsewhere. The rest of the product needs to know which of your stages mean "finished" — that is how
> it knows a parent job can be closed, how progress counts work, and what "Only tickets in progress"
> filters. A stage with the wrong category makes everything downstream guess wrong.

> **Your layout is not saved.** The positions you drag the boxes into are for this session only. Come
> back tomorrow and it will have laid itself out again. Known, deliberate for now — do not spend
> twenty minutes tidying.

### Rules you can put on an arrow

Exactly five, and no more:

1. **Require a comment** — must explain the move.
2. **Require evidence (attachment)** — must attach a file. The person moving the job picks the file
   on the job screen; the move stays blocked until the server has stored it. (See §7. **Until
   2026-09-19 this did not work and the advice here was not to use it** — an evidence rule made a
   move impossible for everybody. That is fixed.)
3. **Require a field to be set** — must have filled in a particular field first. You pick the field
   from a list, including the built-in ones.
4. **Require a different user (four eyes)** — whoever made an earlier named move cannot make this one.
5. **Restrict who may move it** — only the assignee, or certain roles, or named people.

Each rule is written out in plain language on the arrow, so you can read your own setup back without
decoding it.

### Deleting a stage while you are editing

Deleting a stage removes every arrow connected to it. If that stage happened to be the starting stage,
or was named by a four-eyes rule, **the builder deliberately leaves those references dangling** rather
than quietly picking a new starting stage for you. The problem checker below will flag it and make you
fix it yourself.

### The problem checker

There is a live checklist that refuses to let you publish if, for example: there are no stages at all;
there is no finished stage; an arrow points at a stage that does not exist; a stage nothing can reach;
a finished stage with no way in; two identical arrows; or a "who may move it" rule that names nobody.

Each issue is clickable and jumps you to the offending box or arrow. **The Publish button stays off,
with the reason written out, for as long as any of them stands.** When it is clean it says *"No issues
— this workflow can be published."*

### Advisories

There is a separate list headed **"Worth a look — none of these block publishing"**. These are advice,
not errors. Typically: you have put a guard on one route into a stage, but there is another route in
without the same guard, so the guard can be walked around. It publishes anyway; it is just telling
you.

### Publishing, and what happens to existing jobs

1. Press **Publish**.
2. If your new version **drops a stage that jobs are currently sitting in**, a dialog stops you and
   lists every dropped stage with how many jobs are in it and a picker for where they should go.
3. You have to pick a destination for **every** dropped stage. Leave one out and it names the one you
   missed: *"Every dropped state needs a destination."* If it cannot even count how many jobs are in a
   stage it says "unavailable" next to the count and **still makes you decide** — it will not let you
   skip it.
4. Confirm.

Publishing again makes version 2, and **jobs created under version 1 stay on version 1** unless they
are moved across. Renaming a stage without removing it publishes with none of this extra step.

If your publish is rejected — usually because somebody else published a newer version while you were
editing — you are shown the exact message the server sends back, in its own words.

### The one rule you cannot author

There is a panel naming the invariants that are fixed and not yours to change. The one that will
affect you: **a parent cannot be finished while any of its children is still going.**

---

## §12 — Setting up your own job types (owners and admins)

There is a separate screen for these. It lists your types with their rank, how many custom fields each
has, and a **Built-in** badge on the four that came with the workspace.

### Making a new type

Press **New type** and fill in:

- **Name** — call it what your business calls it. "Callout". "Quote". "Job".
- **Icon** — pick one.
- **Hierarchy rank** — how big a thing it is. **Rank 1 is the biggest** (a whole client project);
  bigger numbers are smaller pieces. A job can only sit under a job with a smaller rank number.
- **Workflow** — which of your published stage sets this kind of job uses.
- **Custom fields** — text, number, date, a dropdown, or a person.

If you put a type at the very bottom rank, the screen tells you straight away that jobs of that type
will always need a parent. If it is higher up, it says nothing of the sort. That is useful — it tells
you the consequence at the moment you are choosing.

**If a dropdown field will not save:** a dropdown needs its list of options, one per line. Without any,
it is refused. Same if you try to give options to a field that is not a dropdown, or reuse a field
name.

### The built-in four

You **can** rename epic, story, task and sub-task, change their icons, and change which stage set they
use. Do it — "Epic" and "Story" mean nothing in a plumbing business or a design studio.

What you **cannot** change is where a built-in type sits in the hierarchy. The rank boxes are locked
and the message says why: *"Built-in type — its place in the hierarchy is fixed."* So a renamed
sub-task will still always need a parent. Custom types you make yourself can be re-ranked in either
direction later.

### Pointing a type at a different stage set

Existing jobs stay where they are, on the stages they were created under. New jobs of that type get
the new set.

If you want to move the existing ones across, there is a separate step that makes you map **every**
stage currently in use onto a stage in the new set — the same discipline as dropping a stage. Miss one
and it moves nothing and names what you missed.

---

## §13 — On your phone or computer, and with no signal

### What actually exists

There is a real desktop app and a real phone app, each keeping its own copy of your work on the
device. They are not just the website in a frame.

**Be careful what you expect from either.**

- **The phone app is two screens**: a board, and a job. That is the whole app.
- **The desktop app has no sign-in of its own yet.** It tells you to sign in on the website, then copy
  something across and paste it into the app's settings by hand. That is described as a temporary
  arrangement. It is not something to ask a nervous colleague to do.
- **Neither app has been tested on an actual phone or an actual computer** in the field — only the
  pieces underneath have. Treat both as early.

**The browser version is online-only.** It has no offline queue at all. Offline is the phone and
desktop apps' job.

### What works with no signal

**Reading works.** On a device that already has a copy, you can open the job list, open a job, see the
board, read a job's full history, see the job types and stages, and see your assigned work — all from
the copy on the device.

**Changing is limited to what the two screens offer.** The queue underneath will happily carry a new
job, a field value, a stage move or a reopen, and hold them until you reconnect. But a change these apps
cannot make on screen is one they cannot make online either — the queue accepting a kind of change is
not the same as a screen offering it, and the phone app is two screens deep. In
practice, offline you can create a job, move one between stages, reopen one, post a comment, and deal
with a disputed claim. **Offline you still cannot assign anybody or set a due date — and here that is a
property of these apps rather than of being offline.** The phone app has no "Assignee" row in either
state, while the website's panel can set one and simply has no offline queue to carry it: the browser
version is online-only.

Whatever you *do* manage to do is queued and sent when you reconnect.

**One narrow thing to know:** a job you create *entirely* while offline will not show up on the board
or the job list until the server has confirmed it. Do not panic — search for it by name in the offline
search and it will turn up.

**Seven things flatly refuse offline** rather than making something up: your list of workspaces, the
people list, the ordinary search, the standard My Work view, the "Needs your attention" strip, and both
reading and saving your preferences. Each one names what is missing rather than showing you an empty
screen.

**Searching offline:** the phone app's board screen has a search box. With no signal it says "searching
offline copy" underneath, so you know the results might be a little out of date.

**That is no longer the only search box in the product.** The website's project board has one too,
above the tabs and labelled **"Search the board"**. It cannot help you offline — the website is
online-only — so it is named here only so you know it is there.

### The status strip

Both apps show a strip with plain-English states:

- **"Live"**
- **"Catching up…"**
- **"3 claims waiting to send"** (and it gets the singular right: "1 claim")
- **"Offline — 3 claims waiting to send"**
- a separate "needs attention" count for changes that were permanently refused

When everything is fine and nothing is queued, it shows no alarming badge at all. If the connection
errors, the message appears *beside* the status rather than replacing it, in the server's own words,
ending with **"still retrying"** — it is specifically forbidden from ever saying it will not
reconnect, because it will.

A **"claim in transit"** badge appears on a job, both on the board and in job lists, for something you
changed that the server has not confirmed yet. The job screen shows your unconfirmed change alongside
the last confirmed version, so you can see both.

### Getting back online

It is automatic. You do not have to do anything.

Your changes go up **in the order you made them**, so a job never gets edited on the server before it
has been created there.

Before it even queues something, the app checks it against the real rules on your own device — so an
obviously illegal change is refused on the spot, in the rules' own words, and never queues at all. And
it reads your queued-but-unsent changes as if they had already happened, so reopening a finished
parent and *then* filing a job under it both work offline, where filing the job alone would not.

**If the network fails halfway through sending**, that is treated as temporary. Your change stays
queued and is retried with a growing gap between tries — a second, then two, then four, up to about a
minute. It is **never** marked as failed for a network problem. Only a genuine "no, that breaks a
rule" answer is final.

### When two people changed the same thing

There are two situations and they are treated very differently.

**A plain race — you both just typed different things.** The later one wins. The earlier one survives
in the job's history. **Nobody is told.** No banner, no warning, no record of a dispute. A race is not
a rule violation.

Be aware of that. If two of you change the same brief while one is on a train, one of you gets quietly
overwritten and neither of you finds out. The history has it; nobody is going to go looking.

**Your change had become against the rules by the time it arrived** — the job got reassigned, or the
stages changed, or it got un-shared from you. Then it is refused and recorded as a **disputed claim**,
and you get a banner about it.

### The disputed-claim banner

It names who claimed it, what kind of change it was, which rule refused it, that rule's reason in its
own words, and when you made it — in Indian time, like *"21 Aug 2026, 00:00 IST"*.

You get three buttons:

1. **Discard it** — throw it away. You can add a short note saying why.
2. **Convert to comment** — turn what you tried to do into a permanent comment on the job, carrying
   your words, your name, the rule and the time. **This is usually the one to use:** the attempt stays
   on the record even though the change did not land.
3. **Redo legally** — send it fresh, properly, linked as the replacement. (You cannot just resend the
   rejected one — it would fail the same way.)

If there is nothing disputed, the banner is not there at all.

Resolving one while you are still offline is itself just another queued action. The app will not tell
you the server accepted it until the server actually has.

Generally the other person is **not** told your change was refused — it shows in your disputed list
and leaves theirs empty. There is no side-by-side comparison screen, no merge screen, and no "somebody
else changed this" review anywhere in the product. That banner is the only conflict surface there is.

### If your device clock is wrong

Your unsent changes carry your device's time until the server accepts them, and then the server's own
time takes over.

If your clock is ten minutes or more out, a flag appears saying so in plain words: *"device clock ran
11 min ahead of the server"*. Note the wording — it blames your clock, not the event. Under ten
minutes it shows nothing.

### Phone alerts

They do not work. The phone app registers for them and there is nothing on the other end to register
with. It reports the feature as unavailable rather than pretending or crashing.

---

## §14 — The time zone, and other things worth knowing

### Everything runs on Indian time

**The whole product runs on Indian time, for everybody, everywhere.** A "day" starts at midnight in
India — not midnight where you are, and not midnight in universal time.

What that means in practice if you are not in India:

- In London, the product's "today" flips over at about **half past six in the evening**.
- In Los Angeles, it flips over in the **late morning**.
- A job you file at 11pm your time may already be labelled tomorrow.
- Every due date, every "today" ring on the calendar, and every day boundary means India's day.

The reasoning is that everyone reading the same record sees the same day for the same moment, which is
defensible. But if you are running a business in Manchester, "due today" is going to mean something
odd, and you should know it before it surprises you.

There is a footnote naming the time zone at the bottom of a job's history. That is the only place in
the product that acknowledges it.

### If something breaks

You get one short, plain, generic failure message. You will never see technical wreckage, a file path
or program code on your screen. Genuine refusals — "you can't do that because…" — still reach you word
for word.

There is no "report a problem" button, and no version number anywhere on screen, so if you need to
report something you will not be able to say which version you are on just by looking.

There is no maintenance or "come back later" message, and no "a new version is available, please
refresh" prompt. Nothing describes either as existing today.

### Doing things too fast

There are limits on how often you can do things. One thing to watch: **uploading files draws on the
same allowance as everything else**, so a burst of uploads temporarily eats into what is left for
ordinary work. Two people on the same office wifi get separate allowances rather than sharing one.

### Backups

The whole database is copied every night, and a complete export of all recorded activity is taken once
a week. If everything were lost, you would lose up to about a day's work.

A restore has actually been done by hand, more than once, and it is only accepted if the record count
matches the original — which is worth more than a promise, because doing it found real problems that
reading the instructions never would have.

Two honest caveats: **if the backups start failing, nobody is notified by default** — the notification
destination ships blank, so unless somebody set it up, a failing backup is invisible. And the weekly
export loads the whole history into memory before writing anything, which is the job that will break
first as the history grows.

Uploaded files that nothing refers to any more are deleted automatically, roughly monthly, and there is
no undo.
