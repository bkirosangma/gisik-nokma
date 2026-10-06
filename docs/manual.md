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
2. **You cannot create a project unless you are an owner or an admin.** Those two roles get a
   **Create project** button on the workspace page; a member or a guest is told why it is not there
   instead of being shown a button that fails. If you are neither an owner nor an admin and your workspace has no
   projects, there is nowhere to put work, and one of them will have to add one for you. (§3)
3. **You can put a ticket on a person only on the website.** The website's ticket panel has an "Assignee"
   picker. The phone and desktop apps have no Assignee row at all, so there you can neither see who a
   ticket is on nor set it. (§5)
4. **You can leave a comment on a ticket now, on the website and on the phone.** The ticket screen shows the
   description, lets you write one, and carries a comment thread with its own box at the end of it. A
   move carrying a "require a comment" rule still puts a box on the Move dialog, and what you type
   there is recorded on the move. (§5)
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
| **Project** | A bucket of work inside a workspace. "Shop operations". "Residential repairs". |
| **Ticket** | One piece of work. |
| **Epic / Story / Task / Sub-task** | The four built-in kinds of ticket, biggest to smallest. An admin can rename these. |
| **Workflow** | Your set of states that work moves through, and the allowed moves between them. |
| **State** | One step in a workflow. Each state is a column on the board. |
| **Transition** | One allowed move from one state to another. |
| **Terminal** | A state that counts as finished. |
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

The same is true if you click a link (an invitation, or a link to a ticket) while signed out: it
remembers where you were headed and sends you there afterwards.

To sign out, open the **account menu** at the right-hand end of the bar — the round button carrying your
initial — and choose **Sign out**. Signing out really does end it — the next thing you try on that
device is refused immediately, not "at some point later". That matters if you have signed in on somebody
else's laptop.

To see where else you are signed in, open **Account** and look under **Sign-in and devices**. Each
browser you have signed in on is one row — for example "Chrome on Mac" with a short four-letter code, so
two identical browsers can be told apart — with when it was last active and when you first signed in
there. The ones used in the last 24 hours are listed first; the rest wait under **Signed in, idle**, which
you can open. **Sign out this device** ends that one; **Sign out all other devices** ends every one except
the one you are using. The device you are using cannot be signed out from here — use the account menu.

Your **Passkeys** are listed in the same place, grouped under the kind of authenticator that holds each
one — for example "iCloud Keychain" or "Windows Hello", with a security key or anything unrecognised last.
Each shows when you added it and when you last used it to sign in, or "Never used". A passkey that has not
been used for about three months is marked **Not used recently**; if you no longer have that device,
choose **Delete** beside it.

---

## §2 — Finding your way around

There is a small bar across the top of nearly every screen. Inside a workspace it carries:

- **Gisik Nokma** — the logo at the far left. It takes you to **Home**: your workspace's numbers and its Knowledge Graph.
- **Workspaces** — the list of every workspace you are in.
- **My work** — the tickets assigned to you.
- **Members** — the people in this workspace, and what they are.
- **Settings** — this workspace's own screens: its ticket types, its workflows, its project groups,
  and the workspace itself (§11 and §12).
- The **workspace's name**, linking to its home page, with the project you were last in beside it —
  set apart by a thin divider and labelled **Last project:**. Point at either, or move the keyboard cursor
  onto it, and it opens a list: your other workspaces under the workspace's name (with only one workspace
  it stays a plain link), the workspace's other projects under **Last project:**. The list stays open while
  the pointer moves down onto it and closes a fifth of a second after the pointer leaves. It shows eight
  rows and scrolls past that. With the keyboard, the up and down arrows move through the rows and Escape
  closes the list and leaves the cursor on the name.
- **Inbox** — a small icon at the right-hand end, with a dot on it when you have unread messages.
- **Your avatar** — the round button with your initial on it, opening a menu with **Help**, **Account**
  and **Sign out**.

**My work, Members and Settings appear only once a workspace is open**, and the workspace's name and its
last project appear only once that name has arrived. With no workspace open the bar says so — *"No
workspace selected. Pick one to reach its board, members and settings."* **Signed out there is no
avatar**, so **Help** and **Account** stay in the bar as plain links rather than moving into the menu.

### On a phone or a narrow window

On a phone, and on a tablet or any window up to about 1024 pixels wide, the links leave the top of the
screen and become a **bar along the bottom**: the places you use most, then **More**. **More** opens a
sheet with everything the bar does not carry — including the workspace's last project, set apart with its
**Last project:** label — and **Settings**, **Account** and **Help**.

The bar is yours to arrange. Press **Edit bottom bar**, the last row of **More**, to choose which places
the bar carries and in what order; **Reset to default** puts it back. The product remembers your choice.

On a tall phone the rows in **More** sit at the bottom of the sheet, just above **Edit bottom bar**,
where your thumb is, and the space above them is left empty. On a short screen the sheet scrolls
instead, and nothing is cut off.

### The Help page

**Help** is in the avatar menu (or a plain link in the bar when you are signed out). It holds this manual
and the FAQ, each as one long page that reads straight down. There is no Next button: pick a topic from
the contents list to jump to it, or just keep scrolling.

- **On a computer** the contents list sits on the left and stays in view as you scroll. At the top of it
  are the search box and the **Manual** / **FAQ** switch, so you can search or change document from
  anywhere on the page; only the list of topics below them scrolls. The topic you are reading is
  marked. Press **/** anywhere on the page (except while you are typing in a box) and the cursor jumps
  to the search box; press Escape in it to clear it and go back to where you were.
- **On a phone** the contents list and search are behind a round button at the bottom right of the screen,
  named **Contents and search**. It opens a panel with the search box first, then the **Manual** /
  **FAQ** switch, then the topics, each group with its count. The topic you are reading is marked and
  scrolled into view. Picking a topic closes the panel and takes you to its heading; the ✕ where the
  button was, the Escape key (it clears anything typed in the search box first), or a tap outside it closes the panel
  too, without moving you.
- **Searching** looks through both documents. Type in the box (**Search help**) and the matches replace
  the page until you clear the box, which puts you back at the place you were reading. On a phone the
  matches appear inside the panel; picking one closes it and takes you to that entry, wherever you were
  on the page.

### Light or dark

On your **Account** page there is a **Theme** control with the three choices side by side — not a button
you press to cycle:

1. **System** — follow whatever your computer or phone is set to. This is the default.
2. **Light**
3. **Dark**

If you pick Light or Dark, the product remembers your choice for next time. Pick **System** again and it
forgets your choice and follows your device, including its automatic day/night switch.

---

## §3 — Workspaces, and the project problem

### Making a workspace

1. Go to the **Workspaces** page.
2. Press **Create workspace**, the button at the top of the page. A window opens with a box labelled
   **Name** and one labelled **Prefix (optional)**.
3. Type your business name into **Name**. **Type it exactly as you want it** — the product does not trim
   off extra spaces. If you type spaces at the front, that is what gets saved.
4. If you like, type a **Prefix**: one to three letters, which become the front of every ticket's number in
   this workspace (the **CC** in **CCSO-1183**). Leave it empty and the product makes one up from the
   name. You can change it later (§3, under Change a prefix).
5. Press **Create workspace** in the window. **Cancel** closes it and creates nothing.
6. If it works, you are taken into the new workspace. If it fails, you are told the real reason in
   plain words. A name of nothing but spaces is refused with "A workspace needs a name."

### What you get

You become the **owner** of that workspace. It also sets you up with:

- A basic set of states for work to move through — a simple to-do / doing / done arrangement.
- Four built-in kinds of ticket: **epic**, **story**, **task** and **sub-task**. Those names come from
  software teams and may mean nothing to you. An admin can rename them (§12).

### The project problem

**A brand-new workspace has no projects.** Whether you can make one depends on your role. An **owner or
admin** gets a **Create project** button on the workspace's own page, in the **Projects** heading row,
and that is the only control that creates one. Everybody else gets a sentence saying so instead of a
button that fails: *"Only an owner or admin can create a project."* For a member the
control is not hidden; it is not offered.
Nowhere else offers it: not the Workspaces page, not a settings screen, not the top bar.

Tickets live inside projects. So a workspace with no projects has nowhere to put work.

**What to do about it today:** if you are being set up on Gisik Nokma, ask whoever is setting it up
to put a project there for you. Once a project exists, everything in the rest of this manual works.

### What the Workspaces page shows you

Your name at the top, then a card for each workspace you belong to, carrying that workspace's project
count and — once it has any projects — a line naming them.

- **Click anywhere on a card to open that workspace.** The whole card is one link, the workspace's name
  and its projects line included. This catches people out the other way round now: the name looks like a
  heading and is in fact the door.
- The projects on the card are a **line of text, not links**. There is nothing per-project to click
  there; the project list is one click further in, on the workspace's own page.
- **If you own a workspace, its card has a menu** (the **⋯** button in its corner): **Archive** moves
  the workspace into an **Archived** group below the others — collapsed until you open it — without
  taking anyone's access away, and **Restore** there brings it back. **Delete…** asks you to type the
  workspace's name first, because it removes the workspace from every member at once; it then sits
  under **Deleted items** on your Account page until you restore it. Nobody but the owner sees the menu.

If you belong to no workspace yet, the page says: *"No workspaces yet. Ask an admin for an invite link, or
create your own."* Both of those are real options.

If you have been given a limited role, you may see a workspace's name with no projects listed under
it. **That is deliberate, not broken** — you are being shown your share.

### Renaming a workspace

You can rename a workspace and the new name appears in everybody's list.

Only an owner or admin can. On the workspace's home page they see a pencil button, **Rename** plus the
workspace's name, beside the heading; pressing the name itself does the same. Either one turns the
heading into a box. A member or a guest is shown neither, and a rename that reached the product from
somebody else is refused: *"Only a workspace owner or admin can rename a workspace."*

### Edit a project

If you own a workspace or are an admin of it, a project's card on the workspace's page has an **Edit**
button beside **Archive**, and the project's own page has the same **Edit** next to its name. It opens a
small form with the project's **Name**, **Description**, **Prefix** and **Group (optional)**; press
**Save** to keep your changes, or **Cancel** (or Escape) to leave things as they were. A project needs a
name — leave it blank and the form says so. The new name shows up for everybody in the workspace.

The prefix and the group have their own sections just below. Members who are not owners or admins do
not see **Edit**.

### The three Create buttons

Making something new always starts from a button that says **Create**. The ones in the page headers —
**Create workspace**, **Create project** and the **Create ticket** by the view tabs — are the bright
button with a small plus sign on it. Each one opens a window; nothing is made until you press the button
inside the window.

- **Create workspace** — at the top of the **Workspaces** page. The window asks for a name and, if you
  want one, a prefix.
- **Create project** — on a workspace's page, in the **Projects** heading row.
  Owners and admins only; everybody else is told so (§3, under The project problem). The window asks
  for a name, an optional description, an optional prefix and an optional **Group**: the same four boxes
  as in **Edit** (see Group your projects, below), including making a new group on the spot. One press of
  **Create** never makes more than one project. If the group's name is refused, or the prefix is, that press
  makes no project: the window says why and keeps what you typed. Pressing **Create** again then makes the
  one project, never a second one and never a second group.
- **Create ticket** — in a project, near the top by the view tabs, and on a project's empty Board, where the
  banner's **Create ticket** carries the plus sign too, and inside an empty column on the Board (that one is
  a plainer button under a plus sign, and says **Create ticket** too; its full name for a screen
  reader adds the column's state). The window is described in §5.

If the door refuses what you asked for — a prefix someone already uses, say — the reason is written
inside the window and the window stays open, so nothing you typed is lost.

### Change a prefix

A ticket's number has two halves. The **workspace's prefix** comes first and the **project's prefix**
second, then a dash and a count: in **CCSO-1183**, **CC** is the workspace and **SO** is the project.
You can change either half after the fact.

- **A project's prefix:** an owner or admin presses **Edit** on the project's card or page, types the new
  letters into **Prefix** (one to three letters; it turns your typing into capitals), and presses
  **Save**.
- **The workspace's prefix:** an owner or admin presses **Edit prefix**, under the workspace's name on
  its page, types the new letters into **Workspace prefix**, and presses **Save prefix**.

If the box does not hold one to three letters the form says *"A prefix is 1 to 3 letters."* and **Save**
stays switched off.

**You are asked first.** When the prefix really changes, a window called **Change prefix** tells you what
will happen — every ticket's number is rewritten with the new letters, and the old ones still work. It has
two buttons: **Change prefix**, and **Keep** followed by the old letters. The cursor starts on **Keep**, so
pressing Enter the moment it opens changes nothing. Typing the same prefix back, or changing only the
group, asks nothing.

What changes and what does not:

- **Every ticket's number is rewritten at once**, everywhere it is shown. A ticket that was **CCSO-12** reads **CCSH-12** after the project moves from
  **SO** to **SH**. The count does not change.
- **Old numbers still find the ticket.** Where you search for a ticket by its number — the picker that links a
  ticket into a note (§15), and your assistant's search (§16) — typing **CCSO-12** finds it and lists it
  first, wearing its new number. Search only shows what you are allowed to see, the same as always.
- **Notes keep the key they were written with.** A note that mentions **CCSO-12** goes on saying
  **CCSO-12**, and the mention still opens the ticket.
- **A retired prefix cannot be taken by another project.** Once a project has moved off **SO**, no other
  project in the workspace can start using it, because the old numbers still point to the first project.
  If you try, you are told so in words such as *"Its old ticket keys still point there, so it can't be
  reused."* The project that gave it up may take it back. A prefix another project uses right now is
  refused too.
- **The workspace's prefix works the same way**, for every project at once. A workspace may take back one
  of its own old prefixes.

Your assistant (§16) can read the numbers, search by them and, for an owner or an admin, change a prefix —
but only after it has shown you what would change and you have confirmed with the old letters.

### Group your projects

A workspace with many projects can file them into **groups**, to read them in one tidy tree. Groups have
**four levels**: a level-1 group can hold level-2 groups, which hold level-3 groups, which hold level-4
groups. A project sits directly under one group, or under none.

- **Filing a project.** Owners and admins use **Group (optional)** in **Create project**, or open **Edit**
  on the project (card or page) later. It is four boxes, **Level 1 group** to **Level 4 group**. Each box lists only the groups
  under the one above it, and the next box wakes up once the one above has a value. Pick from the list,
  or type: an exact name picks the group that already exists, and any other name offers **Create “…”** to
  make a new group on the spot. Clearing a box clears the ones below it. If somebody made the same group
  a moment before you, the form says *"Using the existing"* followed by the group's name, and files the project there. Leave the
  boxes empty to take a project out of its group.
- **Seeing them.** On a workspace's page, **Show projects** has two choices, **Grouped** and **Plain**.
  **Grouped** draws the groups as nested sections, level 1 down to level 4, each with a coloured strip
  naming its level, with each project under its own group; groups with nothing in them are left out, and
  projects with no group sit last under **Ungrouped**. **Plain** is the flat grid you had before. The
  page remembers your choice, for you, in each workspace. Guests are not offered it. If the groups cannot
  be read, the page keeps the plain list and tells you so.
- **The Groups page.** Owners and admins build and tidy the tree itself under **Settings → Groups**. See
  The Groups page in §11.

### Deleted items, and getting things back

Everything deleted that you may bring back is listed under **Deleted items** on your Account page: the
workspaces you own, the projects in workspaces you run, the tickets in projects you administer, and your
own notes (an owner or admin sees everyone's). Newest first, each row says what it was, where it lived,
and who deleted it and when. A deleted workspace or project also says how many things are inside it —
they come back with it, and are not listed separately.

- **Restore** brings it back.
- **Mark for permanent deletion** starts the waiting period, and the row then shows the day it will be
  erased for good. **Unmark** stops that. A marked item has to be unmarked before it can be restored.
- Once that day has come the row still shows the date, but it can no longer be unmarked — the erasing
  is already under way.

If the list cannot be read, the section says so, rather than showing an empty list.

---

## §4 — Getting your people in

### Sending an invitation

1. Inside a workspace, go to the **People** page.
2. If you are the owner or an admin, you will see a form headed **Invite somebody**. (If you are not,
   you will see the list of names and a note saying only an owner or admin can invite people. That is
   correct, not a fault.)
3. Fill in:
   - **Address** — their email address or phone number.
   - **Channel** — **email** or **Phone (SMS)**.
   - **Role** — admin, member or guest. (See below.)

   If the email address you typed belongs to somebody who already has an account, the form says so
   when you leave the box, and the invitation goes to the address that account signs in with.
4. Press **Send invitation** (for Phone (SMS) the button reads **Create invite link**). For email, the
   product sends the invitation to that address, and the next screen says it was emailed. If the email
   could not be sent, the screen says so, and you send the link yourself.
5. **The next screen shows you a link, once.** It says: *"Copy it now: it is not stored and cannot be shown again."*

> ## Copy that link before you do anything else.
>
> The link is still shown once. For an emailed invitation you do not need it, but copy it anyway if
> the email did not go. It appears on that screen, at that moment; it is not in the pending list and
> nobody — including you — can look it up again. If you close the tab you have to withdraw the
> invitation and start over.

### About the "Channel" dropdown

**email** sends the invitation for you. **Phone (SMS)** does not send anything yet: it makes the link,
and you send it by message yourself.

### About the "Project access" box

**Removed on 29 September 2026.** Admins and members now see every project in their workspace, so there
is nothing to choose. A guest still sees only the tickets shared with them or assigned to them.

### The four roles

| Role | What it means |
|---|---|
| **Owner** | You, if you created the workspace. Sees absolutely everything in the workspace, including tickets shared with only a few named people. There is no way to hide anything from the owner. No way to hand ownership to somebody else was found on any screen, so plan on the founder staying the owner. |
| **Admin** | Can invite people and set up states and ticket types, and sees every project in the workspace. |
| **Member** | Ordinary staff. Sees every project in the workspace and does the work. Cannot invite people, cannot change how the states work. |
| **Guest** | An outsider — a client, your accountant. Sees only the tickets somebody has shared with them or assigned to them, and nothing else. Cannot see the people list. Cannot create tickets. |

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
- **Inviting an address that already has a pending invitation does not add a second row.** With the
  same role and projects, that invitation gets a fresh link and the email goes out again. With a
  different role or different projects, the pending invitation is replaced by one carrying the new role
  and projects, with a fresh link and a new email. Either way the older link stops working.

If somebody tells you their link does not work, the message they see is: *"This invitation link does
not open anything. It may have been used, withdrawn, or lapsed. Ask whoever invited you for a new
one."*

That message sits under a heading, **This invitation can't be used**, with a **Go to sign in** button
beneath it so the page is never a dead end. If the person is already signed in it also offers **See your
workspaces**, where an invitation waiting for them is listed.

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

**You can see, change and remove — an owner or admin does the last two.** The People page lists the
people you can see in this workspace, and names each person's role. An admin gets a **Role** picker on
every row except an owner's; changing it submits there and then. **An owner or admin can also take
somebody out of the workspace:** **Remove from workspace…** on their row asks you to confirm, and then they
lose access at once. Their history stays, tickets stay assigned to them marked "(removed)", and any
invitation still pending for them is withdrawn. It is never offered on your own row or on the only
owner's row, and if the workspace refuses (an admin cannot remove an owner, for one) the page says so in
the workspace's own words.

This paragraph is kept, rather than deleted, so a reader who remembers the role as unchangeable, or a
person as impossible to remove, finds the correction where they last saw it.

If somebody is removed, it takes effect immediately — on their very next action.
If they are only taken off one project, they lose that project and keep everything else. Their saved
settings are kept for about a month in case they come back.

---

## §5 — Adding a ticket, and what you can change about it

### Adding a ticket

1. Open the project you want the ticket in.
2. Find the **Create ticket** button, near the top by the view tabs — or press **Create ticket** in an
   empty column on the Board, which starts the ticket in THAT state instead (see "Starting status" below).
3. A small window opens with these things:
   - **Title** — what the ticket is. "Fix Mrs. Patel's leaking pipe."
   - **Starts in the backlog?** — a switch, remembered from your last answer. On means the ticket waits,
     unordered work with a Start button, until somebody starts it (§8); off means it is born straight
     into a state.
   - **Type** — what kind of ticket this is, from your workspace's list.
   - **Starting status** — which state of the workflow the ticket is born in, defaulting to the workflow's
     own first state. Disabled, with a note explaining where the ticket will actually start, while "Starts
     in the backlog?" is switched on — a backlog ticket has no starting state.
   - **Start date** and **Due date** — optional, empty by default. Leave either blank to claim no date.
   - **Priority** — P1, P2 or P3; starts at P2. Every ticket has one, and you can change it later (§5).
   - **Description** — the same editor a ticket's own description box uses (§5, below).
   - **Parent** — which bigger ticket this sits under. It defaults to **None (project root)**. Leave it
     alone unless this ticket is part of a bigger one (§6).
   - **Assignee** — who the ticket is on, or leave it unassigned.
4. Press **Create ticket**. On a phone the button stays at the bottom of the window while you scroll the
   form, and under it a short line says what is still missing (for example, that the ticket needs a title).

**On the title:** a blank title, or one that is only spaces, is refused. But extra spaces around real
words are kept exactly as you typed them, so check what you typed if you are fussy about tidiness.

**If the Create ticket button is not there:** see §8 on the 2,000-ticket ceiling.

### What you can change afterwards

Open a ticket by clicking it on any of the ticket tabs — the Backlog, Board, List, Calendar or Timeline. You
get a panel with four tabs: **Details**, **History**, **Attachments** and **Knowledge Graph** (§17).

On the Details tab you can do **five things**:

1. **Move it to another state** — the **Move…** button. (§7)
2. **Change who can see it** — the pill on the **Visibility** row, which opens a menu. (§10)
3. **Set or clear its due date** — the **Due** row's date box. Clearing the box takes the claim off
   rather than claiming a blank date. (§5)
4. **Set its priority** — the **Priority** control, P1 / P2 / P3. Every ticket has one; new tickets start at
   P2. A ticket cannot be left without one, so there is nothing to clear. (§5)
5. **Set or clear its start date** — the **Start** row's date box, like Due. (§5)

**On a phone** the panel opens on the things you change most — State, Assignee and Priority — and the
description is folded behind **Add a description** (**Edit description** once it has one) so the fields
are in the first screen.

Under the ticket's title, above the tabs, there is a short line of chips: the state it is in, a
**Restricted** chip when its audience is a named list rather than the project or the workspace, and a
*"Closed by … on …"* chip once it is closed. Directly below that line is where the ticket sits: *"At project
root"*, or a *"Subtask of …"* chip that opens the ticket above it, or *"Restricted parent: it exists, but you
can't see it"*.

The Details tab then reads top to bottom: the **description** box first, then the field rows — **State**,
**Assignee**, **Priority**, **Due**, **Start**, **Type**, **Visibility** — then **Subtasks**, then
**Comments**. That order is the prototype's, and the alternating tint on every second field row is
decoration that nothing depends on.

**The State row is a row of facts rather than a dropdown, on purpose.** It shows the state, who moved the
ticket there and when, and the **Move…** button. A state change has to go through the rules on the move (§7),
and a dropdown would step around them. **Start** sits beside **Due** and is the same kind of control — a
date box that commits when you click away or press Enter, and **Escape** abandons what you typed without
closing the panel.

Everything else on that panel is there to read rather than to change: the type and the other field rows
all show who claimed the value and when. The controls are the title box at the top, the **Assignee**
picker, the **Priority** picker, the description box, the **Due** and **Start** date boxes, and the
**Visibility** pill.

### Assigning somebody who is not in the workspace

In the **Assignee** picker, choose **Assign someone outside this workspace…**, type their email and press **Find**. If an account has exactly that email, it is shown. Press **Assign**, and they join the workspace as a guest who sees only that ticket. Nothing is listed or suggested: you have to know their email. If nobody has that email, the picker says **No user with that email.** Anyone who can assign a ticket can do this.

### The things you cannot do to a ticket

This is the honest list. Each one is an absence, not a hidden button.

- **You cannot put a ticket on a person on the phone or desktop apps — on the website you now can.**
  This one is kept here rather than deleted, on the description row's precedent below, so a reader who
  remembers it as an absence finds the correction where they last saw it. **On the website the panel's
  "Assignee" row is a picker:** choose a person, or choose **Unassigned** to take the ticket off somebody.
  It stays read-only in exactly two cases, and the row itself says which — the workspace roster has not
  loaded, or the ticket is on a person outside the roster you can see. **On the phone and desktop apps
  there is no "Assignee" row at all**, so there a ticket's assignee can be neither read nor set.
- **You can set a start date now.** It is kept here, rather than deleted, so a reader who remembers it
  as an absence finds the correction where they last saw it. The ticket panel's **Start** row is a date box
  beside **Due**, and behaves the same way: type a day or clear the box to take the claim off.
  **A due date is no longer on this list** — see the row above for the precedent — because the website
  can now set one: the ticket panel's **Due** row is a date box, and clearing it takes the claim off.
- **The description is no longer on this list — you can write it now.** It is kept here, rather than
  deleted, so a reader who remembers it as an absence finds the correction where they last saw it.
  Type into the description on the ticket panel and save it; the panel reads back who set it and when.
  The same box handles formatting and mentions; dropping a file into it is refused rather than
  quietly lost.
- **You can leave a comment on a ticket now.** It is kept here, rather than deleted, so a reader who
  remembers it as an absence finds the correction where they last saw it. The ticket sheet carries a
  comment thread, with a box at the end of it reading *"Add a comment, or type @ to mention someone"*. Its button
  says **Post**, and the line beside it says what posting does — it records an event citing you. A move
  carrying the "require a comment" rule still puts its own box on the Move dialog (§7) and records what
  you type on the move. **The phone app cannot leave one, for now** — commenting from the phone needs a
  signed-in identity the phone shell does not have yet, so the control is withheld there rather than
  shipped in a shape that always fails silently (E5-44).
- **You can edit or delete your own comments.** Each comment you wrote has a **…** button: **Edit** opens it in
  place — change it and press **Save**, or **Cancel** to leave it as it was. An edited comment says *edited* beside
  its time; press that word (or hold it on a phone) to see when. **Delete** asks once — *Delete this comment? It is
  removed for everyone.* — and leaves *Comment deleted*, with who wrote it and when, where it was. Only the person
  who wrote a comment can edit it; they, or a workspace owner or admin, can delete it. Mentions you add in an edit
  notify the new people only. The ticket's History tab reads *Comment edited* and *Comment deleted*.
- **A comment box keeps its formatting tools out of the way.** Under every comment box, on a ticket or a note, and
  in a comment you are editing, a small **Aa** button sits at the left of the row, next to **Attach**. Press it
  (it reads *Show formatting*) to open the same formatting tools above the box, and press it again (*Hide formatting*)
  to put them away; Escape inside the tools closes them too. Your choice is kept on this device for every comment
  box. Hidden tools are still there to type with: Ctrl or ⌘ with B, I or K, Markdown such as `**bold**`, pasting,
  `@` mentions and `:ticket` links all work. A ticket's description and a note's own body always show their tools.
- **You can attach a file to a ticket now.** It is kept here, rather than deleted, so a reader who
  remembers it as an absence finds the correction where they last saw it. The ticket sheet's
  **Attachments** tab lists the ticket's files and has its own **Attach a file** button, and the comment
  box takes one too — paste it, drop it, or press its own paperclip **Attach** button, left of the
  posting note. The **description** box is still the exception: a file dropped into it is refused
  rather than quietly lost, and it draws no Attach button either. A move carrying the "require evidence"
  rule still puts its own file box on the Move dialog and stays blocked until the server has
  stored the file (§7).
- **You can rename a ticket now.** It is kept here, rather than deleted, so a reader who remembers it as an
  absence finds the correction where they last saw it. Open the ticket and type into the title at the top
  of the sheet: **Enter** or clicking away saves it, **Escape** abandons the change.
- **You can delete a ticket now.** It is kept here, rather than deleted, so a reader who remembers it as an
  absence finds the correction where they last saw it. Open the ticket and press **Delete** in the sheet's
  footer. A confirmation opens first: it names the ticket, has a **Delete permanently** switch (off unless
  you turn it on), and says where deleted things go. **Cancel** is where the cursor starts, so pressing
  Enter by reflex deletes nothing. Press **Delete** and the ticket stops appearing in every view — boards,
  lists, search, My work — while **its history is kept**, because other events cite it. **Only a project
  admin may delete**, and the button is not hidden from anybody: press it without the right and the
  confirmation shows the server's refusal and stays open. A message follows with an **Undo** for about
  fifteen seconds, and a line on the page keeps an Undo until you delete another ticket or reload. After
  that the ticket is still listed under **Deleted items** on your Account page, where **Restore** brings it
  back.

  **Delete permanently** does all of that and also marks the ticket to be erased for good after the
  waiting period the confirmation states. Until then the **Undo** (or **Unmark** in Deleted items) takes
  the mark off; once the period is over it cannot be undone.

  **A ticket deleted from My work has no Undo there.** The message and the Undo belong to the ticket's own
  project page, and My work opens the sheet in place without them. The ticket still stops appearing in
  every view, its history is still kept, and it is still in **Deleted items** on your Account page.

  If you would rather not lose it, a "won't do" or "cancelled" state in your workflow remains the
  alternative.
- **You cannot move a ticket to a different project.**

> **The one place the product will take a field value from you — and what it will not take.**
>
> If somebody has put a **"Require a field to be set"** rule on one of your moves (§11), the Move
> dialog puts a box on screen for that field and will not let the move through until you fill it in.
> What you type is recorded as your claim. That is currently the only place in the whole product that
> accepts a field value typed by a person.
>
> **This particular box will not get you a due date.** It is a plain typing box, and the built-in
> "needed by" and "start" dates do not accept plain typed text — they expect a day *and* an optional
> note about it, together, and there is no way to type that into one box. Try it and you will be
> refused with something like *"Due date needs a day in YYYY-MM-DD form (a note is optional)."* (You
> can still set both dates properly — as a real date box, no typing — when you create the ticket, or
> afterwards on its own panel; §5.)
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

### Linking tickets

A ticket can be linked to other tickets, and the **Links** section on its sheet, just under the fields, lists
them. A link has one of three kinds, and reads differently from each end:

- **Blocks** / **Is blocked by**: this ticket has to be finished before the other can go ahead.
- **Relates to**: the two tickets are connected. It reads the same from both.
- **Duplicates** / **Is duplicated by**: this ticket repeats the other.

Press **Add link**, pick how this ticket relates (**Is blocked by**, say), search for the other ticket by its key
or title and choose it. You can add a link from either ticket: GN-142 blocks GN-133, added on GN-142, and
GN-133 is blocked by GN-142, added on GN-133, make the same link. The new row shows at once, faded, and settles when
it is saved. If the link cannot be made (a ticket cannot be linked to itself, and two tickets cannot block
each other), the reason appears beside **Add link** and nothing is added.

**Remove** takes a link away, from either end, and a message offers **Undo** for a few seconds. Links to
tickets you cannot see are not shown, and neither is a count of them.

A link only records the relationship. It does not mark the card, move it, or close a duplicate: close or
move the tickets yourself.

### Why it shows who claimed everything

You will notice that nothing is shown as a bare fact. Instead of a due date reading "30 Aug 2026", it
reads 30 Aug 2026 and whose claim that is.

That is deliberate and it runs all the way through. Nothing on screen is a property the ticket just
happens to have; it is always somebody's claim, with their name and the time on it. It is a little
more to read. It also means you are never left guessing who is responsible for a number.

### The History tab

Every change ever made to that ticket, in order, each one saying who did it and when.

Two things to know:

- **It shows two times for each entry.** One is what the person's own device thought the time was.
  The other is what the product's own system recorded. Usually they match closely. When they do not —
  a wrong clock, or a change made offline that only reached the system hours later — you see both,
  labelled, rather than one made-up time.
- **It stops at 200 entries**, saying so at the top. There is no way to page further back. For a ticket
  with a very long history, the older part is currently unreachable.

---

## §6 — Tickets inside tickets

You can put a ticket underneath a bigger ticket. "Rebrand for Kalita Tea" as one big item, with "Logo
drafts", "Colour palette" and "Print proofs" underneath it.

To do it: pick the bigger ticket in the **Parent** dropdown when you create the new one. A ticket can have
only one parent.

The parent then shows progress across its children — **"3 of 5 done"**.

### The rule about which ticket can go under which

A ticket's type has to be a *smaller* kind of thing than its parent's type. Each type has a rank number:
**rank 1 is the biggest**, and bigger numbers mean smaller pieces. A child's rank has to be strictly
bigger than its parent's.

So: a task can go under a story, a story under an epic. But you cannot put an epic under a story, and
you cannot put two things of the same rank inside each other.

If you get this wrong, the message says so plainly, naming both types — something like "a ticket's
parent must be a bigger kind of work". Once you understand ranks it makes sense. Before you do, it
reads like nonsense.

### "This needs a parent"

Any ticket type at the very bottom rank **must** have a parent. That is what the bottom rank is for — it
is the "part of something bigger" level. Sub-task is there by default.

If you want standalone tickets, use a type that is not at the bottom.

The message tells you this using your own type's name, and once you give it a parent it accepts
straight away.

### Other rules you will meet

- **A parent has to be in the same project.** You cannot reach across into another project.
- **You cannot make a loop.** A under B under A is refused, including the clever cases where somebody
  has reordered the ranks to try to make it legal.
- **A parent cannot be marked finished while any of its children is still going.** All of them have to
  be done first. This is the one rule that sits above every workflow and cannot be turned off — you
  will see it named in the workflow editor as a fixed system rule.

### "5 of 8 done, 2 restricted"

Five of its eight children are finished, and two of those eight are hidden **from you** — not from
everybody, from you, because of who can see what.

The product could have quietly said "5 of 6" and made the ticket look nearly finished. It gives you the
true total and tells you part of it is not yours to see. If nothing is hidden, it does not print the
"restricted" part at all. If a ticket has no children at all, no progress number shows — not "0 of 0",
just nothing.

### "Restricted parent: it exists, but you can't see it"

This means the ticket really does belong to a bigger ticket, and you are not allowed to see what that bigger
ticket is — not even its title. The product deliberately tells you a parent *exists* rather than making
the ticket look like it has none, because those are two different truths.

If a ticket genuinely has no parent, it says **"At project root"** instead — a different sentence, so the
two can never be confused. If there is a whole chain of hidden parents above, you are only ever told
about the one directly above.

### Seeing a ticket's children from its panel

Open a ticket and its panel carries a **Subtasks** section, sitting between the progress line and the
fields. It has four parts.

**The heading** reads "Subtasks", and when the ticket has children it carries their progress on the same
line, in brackets after it — **Subtasks (3 of 5 done)** — with **, 2 restricted** added inside the brackets
when some of them are not yours to see.

**The children**, one line each, with **each child's own state** beside it: *Order the brochures* with a
**To do** chip. A subtask is a ticket in its own right — it gets a state, an assignee, a date and a history of
its own. If a ticket has no children at all, the section says so plainly rather than leaving you an empty
space to interpret.

**When a ticket is itself a subtask**, the heading also carries a chip naming its parent — **"Subtask of
Rebrand for Kalita Tea"**. Press it and that parent's panel opens in place of the one you were reading.
It names the parent directly above and never a whole chain: the parent's own panel draws its own chip in
turn, so you walk a family tree one step at a time rather than being handed a path. If the parent is one
you are not allowed to see, the line reads "Restricted parent: it exists, but you can't see it" instead,
and there is nothing to press.

**The add row** at the bottom of the section takes a **New subtask title** and files the new child under
the ticket you are looking at. It is the ordinary way of adding a ticket that you already know (§5) with the parent
filled in for you, so the new child starts in the first state of its workflow and its title is held to
the same rule as any other: blank, or spaces only, is refused. A refusal keeps what you typed, so you
correct it rather than retype it.

**The row names the new child's type for you, and it will not offer what your ranks forbid.** A subtask
is a ticket of its own and every ticket has a type, so the row picks one: **Task** wherever a Task can sit
under the ticket you are looking at, and otherwise the nearest kind below that ticket which your own list of
types allows. That is the same rank rule as above — a child's rank has to be strictly bigger than its
parent's — read against *your* types rather than the built-in ones, so a kind you defined yourself is
weighed exactly as the standard ones are. Two tickets at the same rank cannot nest, which is why an
**Errand cannot take another Errand** — and in the ladder this project ships, the kind below it is a
**Sub-task**.

**Where nothing at all is smaller, the row is not drawn.** You get a sentence instead — *"This is a
Sub-task. Nothing smaller can sit under it."* — rather than a box and a button that could only end in
a refusal. And if your list of types cannot be read at all, the section says *that* rather than showing
you an empty row and letting you conclude there is nothing below.

**One refusal worth knowing about.** The heading's count comes from the server; the list itself comes
from a separate read. If those two ever disagree — the server counts five children you can see and only
three could be read — the section **shows you no list at all** and says so in the server's own numbers.
It will not quietly show you three and let you assume that is all of them.

### Adding work under a ticket that is already finished

The product will not quietly tack an unfinished step onto a finished ticket. Instead it does the best
thing in the whole product:

1. It tells you the parent is in a finished state, and **offers to reopen it for you**. You get a box
   headed **"Reopen parent?"** naming the finished ticket and its state.
2. It gives you a picker of the states you could reopen it into — only ones that are genuinely
   reachable from where it is and genuinely not finished. You will never be offered "reopen into
   Done".
3. Press **Reopen and proceed**. The parent is reopened first, then your new ticket is filed under it.
4. Press **Cancel** and nothing at all is sent.

If it does not go smoothly, it tells you exactly what happened:

- If the reopen itself is refused (you are not allowed, or a comment is required), your new ticket is
  **not** created, and you are told why.
- If the reopen works but your ticket is still refused for some other reason, you are told **both**
  things — that the parent really was reopened and that is now permanent history, *and* why the ticket
  was refused. Nothing is quietly undone behind your back.
- If your states declare no way out of that finished state at all, it says so plainly with the button
  greyed out — not an empty dropdown you have to interpret.

---

## §7 — Moving a ticket through its states

1. Open the ticket.
2. On the Details tab, press **Move…** next to the current state.
3. A window opens headed **Move ticket**, with a picker of states.
4. Pick where you are sending it.
5. Depending on the state, you may be asked for more before it will let you go ahead. See below.
6. Press **Move**.

### Why the picker only shows some states

Because your workflow decides which moves are allowed. A ticket can only go where an arrow leads from
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
ticket is assigned to, or to specific named people. The refusal names who *is* allowed and says you are
not among them.

The product does not try to guess in advance whether you are allowed. It shows you the option and lets
the server answer, so you find out by trying. Not ideal, but it is never wrong.

**5. It says you cannot approve this because you are the one who submitted it.**
The "require a different person" rule, sometimes called *four eyes*. Whoever made the earlier move
cannot be the one who makes the approving move. Somebody else has to do it. If nobody has ever made
that move on this ticket, there is nobody to compare against and it does not block the first time.

### Two refusal messages at once

Sometimes you will see two messages on screen, and they may disagree. One starts **"instant check: "**
and one starts **"Refused by the server: "**.

- **"instant check"** is your own computer having a quick guess from what it has locally.
- **"Refused by the server"** is the actual answer.

When they disagree, **both stay on screen** rather than one being tidied away. It is confusing the
first time. The alternative is worse: your own machine cheerfully saying "fine" and then the real
answer being no. Read the second one as the answer.

### Moves that work from anywhere

Some workflows have a move set up to work from *any* state — usually a "reopen" of some kind. If there
is no direct move from where your ticket is to where you want it, but a "from anywhere" move to the same
place exists, the product uses that automatically. Its rules are still enforced in full; it is not a
back door.

### If the move works, and if it does not

If it goes through, the box closes, the ticket shows its new state, and any earlier refusal message is
cleared. If the system answers with nothing at all, it says so — *"The server returned no answer for
this change."* — rather than pretending it worked.

### Somebody changed the states after my ticket was created

Your ticket stays on the version of the workflow it was pinned to when it was created. It is not silently
rewritten to follow a new one.

If a state your ticket is sitting in gets removed in a later version, whoever removed it had to say where
those tickets go, and yours follows that. If nobody said, your ticket refuses to move rather than the
product guessing, and it tells you it is stranded.

---

## §8 — Looking at the work

A project has five tabs: **Backlog**, **Board**, **List**, **Calendar** and **Timeline**. Board is what a
project opens on the first time you look at it; after that it remembers the tab you were last on in that
project and opens there.

### Backlog

The first tab, and where a new ticket starts its life. It lists the tickets that have not begun, in an order
you arrange — drag a row, or use the **Move up** and **Move down** buttons on it. Those buttons move a
ticket in the order of the whole backlog, not only within the group it is listed under, and they stay
visible when the backlog is grouped; hover one and it says so. Each row also has a **Start** button that
moves that ticket into its workflow.

It does not leave closed tickets out, unlike the Calendar and the Timeline below. When it is empty it says
so: *"Nothing in the backlog. Tickets you add land here."* — or, when the only thing it would have listed
was an epic, *"Nothing in the backlog. Epics appear in the List."*

### Board

Columns, one per state, with cards in them. There are three ways to move a ticket on: drag its card to a
column, press the **‹** or **›** arrow on the card, or open it and press **Move…** (§7).

**A card moves the moment you let go.** Drop it (or press an arrow) and the card slides into its new
column straight away, while the change is saved in the background. If the change is refused or cannot be
saved, the card slides back to where it was and says why underneath. A move that needs a comment shows
the card in its new place, faded, until you confirm; cancel and it slides back. With your system set to
reduce motion the card simply appears. While you drag, the page scrolls when you bring the card near its
top or bottom edge, and the board scrolls sideways near its left or right edge. Hold a card over a
collapsed column for a moment and it opens; move away and it closes again; drop the card there and it
stays open.

A card shows the title, who it is on, whether it is blocked, its progress, the **‹** and **›** arrows
that carry it to the states it may move to, and a one-line note of what happened last: *"Moved to Doing by
Anselma Marak on 19 Aug"*. Press that line and it adds the year; press it again and it folds back. A move
from an earlier year always shows its year.

Three more badges, when they apply: an **epic chip** on the card's own top line, above the title, when
the ticket belongs to one — press it to open that epic. A **parent-key badge** beside the ticket's own key,
when it sits under a ticket that is not already named by the epic chip — press it to open that parent. And
every card carries its **priority badge** — a coloured icon and P1/P2/P3, tinting the whole card: red
fire for P1, green leaf for P2, frozen-blue snowflake for P3.

**One column at a time on a phone.** Above the board is a row of buttons, one per column, each with the
number of cards in it; the one you press is the column you see, and the others are out of the way (there
is no sideways swiping). The ‹ and › arrows on a card still move it. If a move needs a comment, or is
refused, the board shows the column the card is in until you close the box, so the box and the message
are in front of you, and then goes back to the column you were on. **Create ticket** stays at the
bottom of its window, so you can always reach it.

Columns are grouped by the workflow they belong to, so if two ticket types use different
arrangements you get two clearly separated groups rather than one confusing mess.

**An empty column's own Create ticket button starts the ticket there.** Press **Create ticket** in an empty column
and the Create ticket window opens with that column's status already chosen, the backlog switch off, and
a ticket type from that workflow pre-picked. A column whose state does not allow a ticket to start there —
your admin can turn this off per state (§11) — shows no Create ticket button at all, even empty.

**"Blocked" is a property of the column, not of one ticket.** Whoever built your workflow can mark a state
as a waiting or blocked one — "Waiting on parts", "Waiting on customer". Every ticket in that column is
in that state by definition. There is no switch you flip on an individual ticket to say it is stuck; you
need a state built for it. To record what a ticket is waiting on, link it to the blocking ticket (see
Linking tickets in §5): a link notes the blocker and does not mark the card or move it.

**If the board is empty** it says **which** emptiness it is. A project with no tickets at all gets
*"No tickets here yet. Create one."* A project whose only tickets are epics gets *"No tickets in this
view. Epics appear in the List."* — an epic is real work that this view does not draw, so "create one"
would name the wrong remedy and the List is where it lives.

Those two are the cases the board can tell apart, and it tells them apart exactly. It still cannot say
*why else* a board might be empty to you: the wording is "no tickets", not "no columns".

If you are a member of the workspace but not on that project, an empty board is the correct answer,
not an error.

### List

A table. You choose two things:

- **How to group it** — by epic, status, assignee, type, **priority**, or flat (no grouping).
- **Which columns to show** — from status, assignee, due date, type, progress, **priority**.

Grouping only rearranges. It never hides a row and never changes the counts — the summary at the top
("4 tickets, 1 done") stays the same however you regroup or collapse. Things with nothing to group
under get an honest bucket: **"No epic"**, **"Unassigned"**. They do not vanish.

**"Recently assigned"** is a strip pinned at the top: only your own assignments, newest first, ordered
by when the *system* recorded them so a wrong laptop clock cannot jumble it. A ticket in that strip also
appears in its normal place further down, so you will see it twice. That is intended.

**"default arrangement. You have not arranged this project"** is a note telling you that what you are
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

A marker reads the ticket's key and title — so you can tell which ticket it is without opening it — and the
claim behind it (who said the date, and which one) is in its hover text. On a phone a marker is one line,
cut with an ellipsis if the title is long.

Custom date fields your business set up appear here too, on the same terms, labelled with the field's
own name.

There is a legend with one switch per custom date field that actually claimed a day in the month you
are looking at. Switching one off only hides it from view; it changes nothing about the ticket.

**Closed tickets are hidden here until you ask for them.** The Calendar and the Timeline both leave closed
work out; the List and the Backlog do not, and the Board never shows them at all. So a month can look
emptier than the project really is.

There are two ways to get them back, and only two: set **Closed** to *closed only* in the Filters
sheet, or leave Closed alone and remove the **Closed: hidden** chip that the strip shows while this
default is on. **Watch that chip.** Set **Closed** to *not closed* and you get a chip with the *same
name* whose **×** only undoes your own setting — the default takes over again and closed tickets stay
hidden. *Everything* on the Closed control is not a third way back, because *everything* and *never
touched it* are the same setting here; that is why the chip exists at all.

**If the calendar looks empty**, the sentence NAMES what can hide a claim: your filter, closed tickets being
hidden, a date field you switched off in the legend, or an epic, which is drawn in the List and not here.
It goes on to say *"Undated work is absent, not
estimated"* — the calendar draws only what someone claimed, and an undated ticket is not estimated onto a day
nobody gave it.

**When a date field you switched off is hiding claims in this month, a different sentence says so** —
*"Every claimed date in this month belongs to a field you have hidden"*. **Read that one carefully: it
claims ALL of the month's claims, and the calendar only knows about the claims it was given.** If closed
tickets, or work your filter removed, also have claims in this month, switching the field back on will not
bring those back. *"8 of 12 shown"* in the strip tells you what the filters left — that count cannot see
the legend switches, because those live only in this view.

### Timeline

The same idea stretched sideways over weeks, moving four weeks at a time with **Earlier** and
**Later**. A bar again needs both a start and a needed-by, and it ends on the real day of the needed-by
rather than at the end of its week. A thin line marks today in every row.

Anything with only one date, no dates, or a contradiction goes into a list beside the chart headed
*"Not on the timeline yet"*, with a count. The sentence under the heading says what to do: *"These
tickets have no dates yet."* when none of them has a date, or *"Add a start and a due date to place a
ticket on the timeline."* when some have one. Each entry says what is missing, and its **Add dates**
button opens the ticket so you can set them.

**Closed tickets are hidden here too, on the same terms as the Calendar** — the two ways back, and the
chip it is easy to mistake, are described in that section above.

### The one filter

In the controls row above the tabs, beside the **Filters** button, there is a single switch:
**"Only tickets in progress"**.

Turn it on and you get a note: *"The list, calendar, timeline and backlog are asking only for tickets in
progress. Not started and done are both excluded, and the backlog is emptied. The board is not
narrowed."*

That line is always there, sitting between the project's title and the tab strip; with the switch off it
is simply empty. So turning the switch on changes what the line **says** and never what the page
**looks like** — nothing above or below it moves.

> **Read that last sentence carefully.** The switch **does not affect the Board** — and a project opens
> on the Board the first time you look at it. So you can turn it on, read "Not started and done are both excluded", and be
> looking at a Done column full of done cards. The note exists precisely because of this.

> **And the Backlog is the odd one of the four.** The switch narrows the list, calendar and timeline; on
> the Backlog there is nothing left to narrow, because a backlog ticket is *not started* and the switch
> asks only for tickets already in progress. So the Backlog tab goes empty while the switch is on — and
> it says so, in its own words: *"The backlog is hidden while 'Only tickets in progress' is on."* It
> does not say the backlog is empty, because it is not: the tickets are there, and turning the switch
> off brings them back.

That switch is not the only filter on the website — beside it sits a **Filters** button, and above the
tabs there is a **Search the board** box that narrows what the board shows you.

The deep search is a different thing again: the one that looks through every title, description and
comment in the workspace at once. It has no screen of its own — you reach it only by typing `:ticket `
followed by a few words in a ticket's comment box or in a note (§15), which opens a picker over its
results. There is still nowhere you type a query and read this engine's own results directly.

### The Filters sheet

The **Filters** button in that controls row opens a sheet over the page. It sets the same filter the
search box and the removable chips read — not a second one — so nothing here waits for an **Apply**.
Every click takes effect at once.

Six things can be set, in this order:

- **Assignee** — one row per person in the workspace, with their picture and their name.
- **Collaborators** — the same rows again. (This is the one that does not narrow anything yet — see the
  last paragraph of this section.)
- **Type** — the ticket types your workspace has set up.
- **State** — the states this project's board is built from.
- **Closed** — one control, for tickets that are closed.
- **Category** — **Open**, **Active** or **Terminal**.

Every value is a single button, and each click moves it on one step:

| what you clicked | what shows |
|---|---|
| an empty circle | nothing is being filtered on this value |
| a tick, and **included** in the button's name | only tickets with this value |
| a slash through the circle, **excluded** in the name, and the name struck through | tickets with this value are hidden |

A third click puts the empty circle back.

Two of the six are not lists of your workspace's own values. **Closed** is a single control, so its
three settings read *everything*, *closed only* and *not closed*. **Category** is always the same three
words. The other four are built from what your workspace actually has.

On the **Calendar** and the **Timeline**, *everything* is not enough to get closed tickets back — those
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

**What you set appears under the tabs**, in the strip that counts how many tickets are showing, as a chip.
Each chip carries an **×** that clears everything that one chip names — so if you included two
assignees and they show as a single chip, the **×** takes both, not one.

Two things never become a chip, and both say so in words instead. **Collaborators is the one thing no
tab applies** — the strip's own sentence is *"Not applied on the board: collaborator."* You can set it
and the filter keeps it, but nothing narrows by it. **Closed shows no chip on the Board either**,
because the Board never shows closed tickets in the first place: there the sentence reads *"Not applied
on the board: closed."*, while the other tabs do give it a chip. Both sentences are the product telling
you, rather than quietly ignoring what you asked for.

### Very large projects

There is a ceiling of **2,000 tickets in a project**. Past it, the **Backlog, List, Calendar and Timeline
all refuse** rather than showing you part of a project pretending to be the whole one. **The "Create ticket"
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

A row at the top of My work, headed *"Needs your attention"*, with five kinds of thing, in this order:

1. **Overdue** — a claimed deadline that has passed.
2. **Blocked** — sitting in a state somebody flagged as blocked.
3. **Stale** — has been sitting in the same state too long.
4. **Due soon** — a claimed deadline coming up.
5. **Contested** — a claim somebody disputed; its sentence is the rule's own reason for refusing it.

**Each ticket appears once**, with its strongest reason — a ticket that is both overdue and blocked is one
Overdue row. The strip shows the first five; if there are more, **Show all** and a number opens the
rest, and **Show fewer** folds it back.

Each one carries its own sentence, so you never have to guess why it is there: *"In an active state
since 10 Jul, past the 7-day staleness threshold."* or *"due 5 Oct (in 4 days)"*

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
2. Somebody mentioned you — *"Anselma Marak mentioned you"*, in a ticket's comment or description, or in a note or one of its comments. The row names the ticket or the note, and clicking it opens that ticket or note (for a note's comment, scrolled to that comment)
3. A change of yours was disputed — *"Your claim was contested — [the rule]"*
4. A claimed date is coming up
5. Something has been sitting in one state too long — *"In Doing since 21 Aug, moved there by
   Anselma Marak"*

**To mark one thing read: click the row.** If the marking fails, it reloads to show you the truth
rather than leaving a fake "read" mark. Clicking also takes you to the ticket it is about.

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

**The unread dot** on the Inbox link refreshes about once a minute. It says only *that* you have unread
messages, never how many — the count is in the link's name, which is what a screen reader reads out and
which keeps the signal from being carried by colour alone. If a refresh fails it keeps showing the dot
rather than clearing it, and it shows nothing at all before the first answer comes back — an absence,
not a zero.

**If your Inbox is empty** it says so properly, and the sentence doubles as an explanation of what the
Inbox is for: *"Nothing in your inbox. You will be told here when someone assigns you a ticket,
mentions you, contests a claim, or a claimed day comes near."*

**If there is more than fits**, a **Load more** button appears — only when there genuinely is more. New
pages get added below rather than replacing what you were reading, and if loading fails your existing
rows stay put and you get a retry.

**If you click a message and the ticket will not open:** *"That ticket cannot be opened from here. It may have been removed, or it is no longer visible to you. The message itself is yours and stays."* That
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

### Setting who can see a ticket

Open the ticket. On the Details tab, the **Visibility** row holds a pill showing who can see the ticket
right now — click it. A menu opens with four choices:

- **Everyone in the workspace**
- **Everyone on the project**
- **Only the people I name** — a checklist of your workspace's people appears; tick who you want.
- **Inherited from the parent** — whatever the ticket above it decided.

Pick one and press **Apply**. The menu closes once the change lands; if it does not land — a rule
refused it, or the server could not be reached — the menu stays open with the reason shown beside the
button, so you can try again without losing what you picked.

Under every one of those choices, all the time, there is a line: *"Visible to: these people, and the workspace owner, always."*

That line is a fact, not a caution. **The workspace owner can always see every ticket, whatever you set
here.** It is shown on every option — not only the private one — because showing it only there would
let people assume the other options exclude the owner.

### Who is allowed to change it

A project admin **of that ticket's project**, or whoever created the ticket. Being an admin of a different
project does not help. If you are not one of those, the product will let you fill the form in and the
server will refuse it, telling you why.

### How it flows down

If you set a big ticket to "only the people I name", the smaller tickets under it follow **as long as they
are set to inherit**. Anything that has set its own audience keeps it, and everything under that keeps
it too.

Move a ticket to a new parent and it takes the new parent's audience, along with everything under it.
Move it up to the top and it falls back to the project default. Set it back to inheriting and it and
everything below re-attach.

### Locking yourself out

If you pick "only the people I name" and leave yourself off the list, you get a warning:

> *"You are about to lose access to this ticket. A project admin, or the workspace owner, who always
> sees it, can restore it."*

**And then it does exactly what you told it to.** It does not quietly add you back behind the warning.
That is the right choice — silently adding you would file a claim in your name that you never made —
but it means you have to actually read the warning. You cannot apply an empty list; the button stays
off.

### Reading the setting back

**You can set who sees a ticket, and the screen reads it back to you.** This section is kept, rather than
deleted, so a reader who remembers it as a gap finds the correction where they last saw it. On the
screen whose entire subject is who can see what, the current audience is shown as a sentence — the
mode, or the names when it is set to particular people — rather than as a guess.

Guessing would be much worse, and there is one thing the screen still will not do: when it is set to
particular people and their names have not arrived, it says so rather than filling the space with a
partial answer wearing the shape of a complete one.

### What hidden looks like from the other side

Nothing. It simply is not there. There is no "you don't have permission" screen for hidden work —
hidden means invisible.

If somebody goes looking for it directly, they get exactly the same "not found" as they would for a
made-up reference. That is deliberately identical, so that nobody can work out what exists by watching
which refusals they get. The same is true of a ticket's history and of trying to change one.

If you have access to no tickets in a project at all, the list just looks empty to you — indistinguishable
from a genuinely empty project.

### Guests

A guest sees only the specific tickets somebody explicitly shared with them. Not the project, not the
workspace's other work. They see the workspace's name and an empty project list — which is intended,
not broken.

They *can* see a child of something shared with them, if that child inherits. They cannot open the
people list. They cannot create tickets. If a guest is looking at a ticket that somebody else is assigned to,
that person shows up as an identifier rather than a name — not blank, just not a name. Slightly ugly,
and better than leaking your staff list to an outsider.

### What you cannot hide

**Who did what.** History always shows who acted and when, untouched, to anybody entitled to see the
ticket — even when that person shares no project with you. You can hide the *work*. You cannot hide *who
acted*.

Nor can anybody act under your name. That is refused outright, even for the owner, and it is checked
before anything else.

---

## §11 — Setting up your own states (owners and admins)

### Getting to the screen

**The app links to it.** There is a **Settings** link in the top bar; it appears once a workspace is
open, and it opens that workspace's settings, where the workflow editor, the ticket-type editor and the project-group
tree live.

Nothing to bookmark. One wrinkle worth knowing: the bare address `/settings` with no workspace on it
offers nothing usable, because the shell remembers no "current workspace" outside a route or a query
parameter. It still resolves, and what it says then is accurate — pick a workspace and it points you at
the list. Reaching it through the link never has this problem.

### Who can use it

Owners and admins only. If a member goes there they get: *"You can look, but not change anything. Only a workspace
owner or admin can change workflows and ticket types."* No "New workflow" button, all the boxes
switched off. They can look, they cannot break anything, and there is no way to accidentally publish.

### Starting from a template

You do not have to draw one from scratch. There are three templates plus a blank:

| Template | What it is |
|---|---|
| **Simple kanban** | To do, doing, done. No rules: anything moves along the arrows. **Start here.** |
| **Approval chain** | Draft, submit, approve, with four eyes: whoever submitted cannot be the one who approves. Good for anything a client signs off. |
| **Errand with waits** | Has a "Waiting" state marked as blocked, for when you are stuck on somebody else. Useful if your work has waiting periods. |
| **Start from a blank workflow** | An empty canvas with one starting state called "New". |

Press the template's card (each is one control, named **Use the [name] template**) and it copies it in; the fourth card, **Start from a blank workflow**, starts empty. You then get your own independent copy — it
does not stay linked to the template, and changing yours affects nobody else's. You can change it
before publishing.

> The **Errand with waits** template deliberately trips two of its own warnings, because it is modelled
> on a real shop's real process, warts included. That is expected. Do not panic when a template warns
> about itself.

### Building one

It is a drawing canvas. Each state is a box. **Add state** makes a new one. Each box has:

- **A name** you type.
- **A Category** dropdown — whether that state counts as *not started*, *in progress*, or *finished*.
- **A blocked tick box** — for states that mean "we are stuck waiting on someone".
- **A start marker** — which state new tickets begin in.
- **A "Tickets can start here" tick box** — on by default; untick it to stop a ticket being born straight
  into that state (the Starting status picker on the Create ticket window will not offer it, §5). Greyed
  out and stuck on for the state your start marker points to, with the note *"The start state always
  allows new tickets"*, and for a finished state, with the note *"A done state can't be a starting
  status"*.

**To connect two states, drag from the edge of one box to the edge of another.** That makes an arrow,
which means "a ticket can go this way".

**Or press Add transition.** It opens a small form: pick where the arrow starts under **From** (a state,
or **Any state** for a move allowed from anywhere) and where it ends under **To**, then press **Add**. If
that arrow already exists, or you picked the same state twice, the form says so and **Add** stays greyed
out. The new arrow is selected, so its rules are right there to edit.

**The canvas opens showing the whole drawing**, zoomed out as far as it needs to be to fit (never past a
quarter size). After you have panned or zoomed, the **Fit to screen** button at the bottom left brings
the whole drawing back. The tick boxes on a state are big enough to tap, and when one is stuck on, the
reason is written under it rather than hidden in a hover.

**The left-hand column lists everything, and each row opens in place.** Above the system rules you will
find a **States** list and a **Transitions** list, each with a count. Press a row and it opens right there
to show its settings: for a state, its name, **Set as start** and **Delete state**; for an arrow, its
rules, **Add rule** and **Delete transition**. Only one row is open at a time — opening another closes
the first — and pressing the open row closes it. It is the same thing as clicking a box or an arrow on the
canvas: click one and its row opens in the list, open a row and its box or arrow lights up on the canvas.
An arrow can be clicked anywhere along its line, whether or not it carries any conditions. On a wide
screen (outside full screen, below) the column stays beside the canvas and scrolls by itself when it is
longer than the window, so the canvas and the page do not move while you read down it.

**Full screen gives the drawing the whole window.** Press **Full screen**, at the top or in the canvas's
top-right corner, and the editor covers the window, keeping your zoom and where you were. The controls
float in one row along the top: the name, **Add state**, **Add transition**, zoom, **Tidy**, **Issues**
(with the number of problems that stop you publishing), **Publish** and **Exit full screen**; on a
narrower window zoom and Tidy are under **More**. The left-hand column is not shown. In its place a panel
on the right opens when you click a box or an arrow, or press **Issues**; its tabs are **Selection**,
**States & transitions**, **System rules** and **Issues**, and you can drag its left edge to make it wider
or narrower. **Escape** closes one thing at a time: an open menu or the publishing dialog first, then the panel, then full screen.
Switching full screen on or off leaves a publish you have started open, with the destinations you picked.
A reload keeps you in full screen until you exit it. On a phone the panel rises from the bottom instead.
Two moves are listed at the bottom of **Transitions** but cannot be opened, because every workflow has
them and nobody can change them: **Start** (out of the Backlog) and **Send to Backlog**.

Boxes and arrows are not hard. It is the vocabulary around them that trips people, not the drawing.

> **Get Category right.** It is the one bit of setup where getting it wrong quietly breaks things
> elsewhere. The rest of the product needs to know which of your states mean "finished" — that is how
> it knows a parent ticket can be closed, how progress counts work, and what "Only tickets in progress"
> filters. A state with the wrong category makes everything downstream guess wrong.

> **Your layout is not saved.** The positions you drag the boxes into are for this session only. Come
> back tomorrow and it will have laid itself out again. Known, deliberate for now — do not spend
> twenty minutes tidying.

### The Groups page

**Settings → Groups** (the tab sits between **Workflows** and **Workspace**) draws the workspace's project
groups (§3, under Group your projects) as a tree, left to right: one column per level, with a coloured strip
on each box naming its level; the boxes inside one group hang from a single vertical line. On a phone the same tree is an indented list. Everybody who is a member of
the workspace can read it; a guest is told *"Groups are shown to workspace members."*; a workspace with
no groups says so.

Owners and admins can change it:

- **Add group** adds a top-level group. You type its name into the field that opens and press Enter.
- The **+** on any box below level 4 adds a group inside it. A level-4 group cannot hold another.
- **Click a name to rename it.** Enter saves; Escape cancels. Either way the cursor comes back to that
  group's name, so the next key press carries on from there.
- **Drag a box up or down among its neighbours** to reorder them. Without a mouse, put the cursor on the
  name and press **Alt** with the up or down arrow. There is no drag on a touch screen.
- **Delete** asks you to confirm, and is offered only on a group that holds no project and no
  sub-group. Move the projects out (**Edit** on each) and delete the sub-groups first. When you confirm, the cursor moves to the group below it, else the one above it, else
  the parent, else **Add group**; if you cancel it goes back to that group's **Delete**.

Each change is saved as soon as you make it, one at a time. If the product refuses — two groups with the
same name side by side, or a group still in use — it says why in its own words and the tree stays as it
was.

### Rules you can put on an arrow

Exactly five, and no more:

1. **Require a comment** — must explain the move.
2. **Require evidence (attachment)** — must attach a file. The person moving the ticket picks the file
   on the ticket screen; the move stays blocked until the server has stored it. (See §7. **Until
   2026-09-19 this did not work and the advice here was not to use it** — an evidence rule made a
   move impossible for everybody. That is fixed.)
3. **Require a field to be set** — must have filled in a particular field first. You pick the field
   from a list, including the built-in ones.
4. **Require a different user (four eyes)** — whoever made an earlier named move cannot make this one.
5. **Restrict who may move it** — only the assignee, or certain roles, or named people.

Each rule is written out in plain language on the arrow, so you can read your own setup back without
decoding it.

### Deleting a state while you are editing

Deleting a state removes every arrow connected to it. If that state happened to be the starting state,
or was named by a four-eyes rule, **the builder deliberately leaves those references dangling** rather
than quietly picking a new starting state for you. The problem checker below will flag it and make you
fix it yourself.

### The problem checker

There is a live checklist that refuses to let you publish if, for example: there are no states at all;
there is no finished state; an arrow points at a state that does not exist; a state nothing can reach;
a finished state with no way in; two identical arrows; or a "who may move it" rule that names nobody.

Each issue is clickable and jumps you to the offending box or arrow. **The Publish button stays off,
with the reason written out, for as long as any of them stands.** When it is clean it says *"No issues.
This workflow can be published."*

### Advisories

There is a separate list headed **"Worth a look (none of these block publishing)"**. These are advice,
not errors. Typically: you have put a guard on one route into a state, but there is another route in
without the same guard, so the guard can be walked around. It publishes anyway; it is just telling
you.

### Publishing, and what happens to existing tickets

1. Press **Publish**.
2. If your new version **drops a state that tickets are currently sitting in**, a dialog stops you and
   lists every dropped state with how many tickets are in it and a picker for where they should go.
3. You have to pick a destination for **every** dropped state. Leave one out and it names the one you
   missed: *"Every dropped state needs a destination."* If it cannot even count how many tickets are in a
   state it says "unavailable" next to the count and **still makes you decide** — it will not let you
   skip it.
4. Confirm, or press **Cancel** (or Escape) to stop without publishing.

Publishing again makes version 2, and **tickets created under version 1 stay on version 1** unless they
are moved across. Renaming a state without removing it publishes with none of this extra step.

If your publish is rejected — usually because somebody else published a newer version while you were
editing — you are shown the exact message the server sends back, in its own words.

### The one rule you cannot author

There is a panel naming the invariants that are fixed and not yours to change. The one that will
affect you: **a parent cannot be finished while any of its children is still going.**

---

## §12 — Setting up your own ticket types (owners and admins)

There is a separate screen for these. It lists your types with their rank, how many custom fields each
has, and a **Built-in** badge on the four that came with the workspace.

Each type you made yourself has a **Reorder** button opening a small menu — **Move up**, **Move down**
and **Move to top** (the top of your own types). An item that cannot apply is greyed out and says why in
words. The four built-in types have no Reorder button: they keep their rank, and your own types are
ordered among themselves.

### Making a new type

Press **New type** and fill in:

- **Name** — call it what your business calls it. "Callout". "Quote". "Ticket".
- **Icon** — pick one.
- **Hierarchy rank** — how big a thing it is. **Rank 1 is the biggest** (a whole client project);
  bigger numbers are smaller pieces. A ticket can only sit under a ticket with a smaller rank number.
- **Workflow** — which of your published workflows this kind of ticket uses.
- **Custom fields** — text, number, date, a dropdown, or a person.

If you put a type at the very bottom rank, the screen tells you straight away that tickets of that type
will always need a parent. If it is higher up, it says nothing of the sort. That is useful — it tells
you the consequence at the moment you are choosing.

**If a dropdown field will not save:** a dropdown needs its list of options, one per line. Without any,
it is refused. Same if you try to give options to a field that is not a dropdown, or reuse a field
name.

### The built-in four

You **can** rename epic, story, task and sub-task, change their icons, and change which workflow they
use. Do it — "Epic" and "Story" mean nothing in a plumbing business or a design studio.

What you **cannot** change is where a built-in type sits in the hierarchy. The rank boxes are locked
and the message says why: *"Built-in type. Its place in the hierarchy is fixed."* So a renamed
sub-task will still always need a parent. Custom types you make yourself can be re-ranked in either
direction later.

### Pointing a type at a different workflow

Existing tickets stay where they are, on the states they were created under. New tickets of that type get
the new workflow.

If you want to move the existing ones across, there is a separate step that makes you map **every**
state currently in use onto a state in the new workflow — the same discipline as dropping a state. Miss one
and it moves nothing and names what you missed.

---

## §13 — On your phone or computer, and with no signal

### What actually exists

There is a real desktop app and a real phone app, each keeping its own copy of your work on the
device. They are not just the website in a frame.

**Be careful what you expect from either.**

- **The phone app is two screens**: a board, and a ticket. That is the whole app.
- **The desktop app has no sign-in of its own yet.** It tells you to sign in on the website, then copy
  something across and paste it into the app's settings by hand. That is described as a temporary
  arrangement. It is not something to ask a nervous colleague to do.
- **Neither app has been tested on an actual phone or an actual computer** in the field — only the
  pieces underneath have. Treat both as early.

**The browser version is online-only.** It has no offline queue at all. Offline is the phone and
desktop apps' ticket.

### What works with no signal

**Reading works.** On a device that already has a copy, you can open the ticket list, open a ticket, see the
board, read a ticket's full history, see the ticket types and states, and see your assigned work — all from
the copy on the device.

**Changing is limited to what the two screens offer.** The queue underneath will happily carry a new
ticket, a field value, a state move or a reopen, and hold them until you reconnect. But a change these apps
cannot make on screen is one they cannot make online either — the queue accepting a kind of change is
not the same as a screen offering it, and the phone app is two screens deep. In
practice, offline you can create a ticket, move one between states, reopen one, post a comment, and deal
with a disputed claim. **Offline you still cannot assign anybody or set a due date — and here that is a
property of these apps rather than of being offline.** The phone app has no "Assignee" row in either
state, while the website's panel can set one and simply has no offline queue to carry it: the browser
version is online-only.

Whatever you *do* manage to do is queued and sent when you reconnect.

**One narrow thing to know:** a ticket you create *entirely* while offline will not show up on the board
or the ticket list until the server has confirmed it. Do not panic — search for it by name in the offline
search and it will turn up.

**Seven things flatly refuse offline** rather than making something up: your list of workspaces, the
people list, the ordinary search, the standard My work view, the "Needs your attention" strip, and both
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
- **"Offline: 3 claims waiting to send"**
- a separate "needs attention" count for changes that were permanently refused

**A change to something that was permanently deleted while you were offline cannot be saved.** When the
app reconnects it takes that change out of its queue and puts a note in its place — "A change to an item
that was permanently deleted could not be saved, and was removed." — with a **Dismiss** button. Any other
change the server refused is listed the same way, with the server's reason, and **Dismiss** lets it go.

When everything is fine and nothing is queued, it shows no alarming badge at all. If the connection
errors, the message appears *beside* the status rather than replacing it, in the server's own words,
ending with **"still retrying"** — it is specifically forbidden from ever saying it will not
reconnect, because it will.

A **"claim in transit"** badge appears on a ticket, both on the board and in ticket lists, for something you
changed that the server has not confirmed yet. The ticket screen shows your unconfirmed change alongside
the last confirmed version, so you can see both.

### Getting back online

It is automatic. You do not have to do anything.

Your changes go up **in the order you made them**, so a ticket never gets edited on the server before it
has been created there.

Before it even queues something, the app checks it against the real rules on your own device — so an
obviously illegal change is refused on the spot, in the rules' own words, and never queues at all. And
it reads your queued-but-unsent changes as if they had already happened, so reopening a finished
parent and *then* filing a ticket under it both work offline, where filing the ticket alone would not.

**If the network fails halfway through sending**, that is treated as temporary. Your change stays
queued and is retried with a growing gap between tries — a second, then two, then four, up to about a
minute. It is **never** marked as failed for a network problem. Only a genuine "no, that breaks a
rule" answer is final.

### When two people changed the same thing

There are two situations and they are treated very differently.

**A plain race — you both just typed different things.** The later one wins. The earlier one survives
in the ticket's history. **Nobody is told.** No banner, no warning, no record of a dispute. A race is not
a rule violation.

Be aware of that. If two of you change the same brief while one is on a train, one of you gets quietly
overwritten and neither of you finds out. The history has it; nobody is going to go looking.

**Your change had become against the rules by the time it arrived** — the ticket got reassigned, or the
states changed, or it got un-shared from you. Then it is refused and recorded as a **disputed claim**,
and you get a banner about it.

### The disputed-claim banner

It names who claimed it, what kind of change it was, which rule refused it, that rule's reason in its
own words, and when you made it — in Indian time, like *"21 Aug 2026, 00:00 IST"*.

You get three buttons:

1. **Discard it** — throw it away. You can add a short note saying why.
2. **Convert to comment** — turn what you tried to do into a permanent comment on the ticket, carrying
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
- A ticket you file at 11pm your time may already be labelled tomorrow.
- Every due date, every "today" ring on the calendar, and every day boundary means India's day.

The reasoning is that everyone reading the same record sees the same day for the same moment, which is
defensible. But if you are running a business in Manchester, "due today" is going to mean something
odd, and you should know it before it surprises you.

**A page you left open catches up when you come back to it.** If you leave the Calendar or the
Timeline sitting in a tab over India's midnight, their "today" ring moves to the new day the moment
you return to that tab or bring the window forward — you do not have to reload the page. Until you
look at it again it still shows the day it was drawn on, which you were not there to see.

There is a footnote naming the time zone at the bottom of a ticket's history. That is the only place in
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
export loads the whole history into memory before writing anything, which is the ticket that will break
first as the history grows.

Uploaded files that nothing refers to any more are deleted automatically, roughly monthly, and there is
no undo.

---

## §15 — Notes

### What a note is

A note is a page of writing that belongs to a workspace or a project — not to a ticket. Use one for
anything that is not a single piece of work: a maintenance log, a parts list, a write-up you want to
keep even after the ticket it came from is closed. A note can be attached to a ticket as well, but it does
not have to be, and attaching it does not make it that ticket's property.

Notes have their own place: **Notes** in the left-hand nav, immediately above **Inbox**. Click it and
you are at `/notes`, which lists every workspace and project you belong to and the notes filed in each.

### Making a note

Press **Create note**. A window, titled **New note**, opens with three things:

- **Title** — what the note is about.
- **Home** — the workspace, or one of its projects, the note is filed in. A note lives in exactly one
  place.
- **Scope** — who can see it (below).

Choose a Home first if you want a project-level note: changing Home away from a project puts Scope
back to **Private**, so you are never left with a Scope the note cannot actually have.

Press **Create**. If you belong to no workspace yet, the window says so instead of showing you a form
that cannot succeed.

### Who can see your note

The Scope picker offers up to five choices, in the product's own words:

- **Private** — only you.
- **Workspace** — everyone in the workspace, except guests.
- **This project** — everyone actually on that project, except guests. Being an admin does not put you
  on a project you are not a member of.
- **Same as the ticket** — visible to whoever can see any one of the tickets the note is attached to. This
  choice only appears when the note has a ticket to inherit from.
- **Specific people** — only the people you pick, from a **Who can see it** list.

Two things about the reader rule are easy to get wrong:

- **The workspace owner reads every note**, whatever its scope. That is not a Scope choice — it is true
  of the owner regardless of what you pick.
- **An admin does not.** An admin reads a note under the exact same rule as anyone else: their own
  notes, anything scoped to the whole workspace, anything on a project they are actually a member of,
  anything naming them by name, or anything shared the same way as a ticket they can already see. Being an
  admin gives no extra reach into notes.

The author always reads their own note, whatever its scope — that is what **Private** means.

### Writing a note

A note opens for reading: the page shows the finished text, with no toolbar and nowhere to type. Press **Edit** at
the top right of the note to write in it, and **Done** to go back to reading. A note you have just created opens
ready to write. If you cannot edit a note, there is no **Edit** button.

The editor is the same one the rest of the product uses, with headings and a formatting toolbar: **Undo** and
**Redo**, a **Heading level** menu (Paragraph, then Heading 1 to 6), Bold, Italic, Strikethrough, Code, Link,
Bullet list, Numbered list, Quote, Task item, Code block, Collapsible, Horizontal rule, **Insert table**,
**Insert note** and **Insert ticket**. Hover or tab to any tool to see its name, its keyboard shortcut where
it has one, and the markdown you can type instead. Undo and Redo grey out when there is nothing to step back
or forward to. Pressing Bold, Italic or Strikethrough with the cursor inside a link formats the whole link.
**Insert note** and **Insert ticket** each drop the `:note`/`:ticket` trigger at the cursor and open the same
picker typing it would — the same two triggers work from the keyboard too, and `[[` still works for a note.

On a phone the toolbar is a single row that sits just above the on-screen keyboard while you type, and scrolls
sideways when it does not all fit. It carries Bold, Italic, Bullet list, Task item, the Heading level menu, Link,
**Insert ticket** and **Insert note**; **More tools** at its right end opens a sheet from the bottom with the rest —
Undo, Redo, Numbered list, Strikethrough, Code, Quote, Code block, Collapsible, Horizontal rule and **Insert table** —
as large labelled buttons. Pick one and the sheet closes and you are back in the text where you were; Escape or a tap
outside the sheet closes it without changing anything.

**Insert table** opens an eight-by-eight grid: move the pointer (or the arrow keys) to light the size you
want, the label reads, for example, "2 × 3 table", then click (or press Enter) to insert it with a header
row. Escape closes the grid; press elsewhere to dismiss it. The tool is greyed out while your cursor is
inside a table, because a table cannot be placed inside another.

**Editing a link.** Click into any link's text and a small panel opens beside it with the **URL** and the
**Text**, an **Open link** shortcut (web, email and phone addresses only) and **Unlink**. Enter or clicking
away keeps a change, Escape puts it back. An empty URL, or Unlink, takes the link off and keeps the words;
an empty Text deletes the link. Ctrl-K (Cmd-K on a Mac) with the cursor in a link jumps straight into the
URL field. The panel appears only for the box you are typing in.

**Notes save themselves.** A couple of seconds after you stop typing, your change is sent — not on
every keystroke. Until it is accepted the footer says **Saving…**; once it is, **Saved**. If it cannot
reach the server your change is not lost: it is kept on this device and the footer says **Not saved
(kept on this device)** until it goes through. Leaving the note, switching away, or closing the tab all
flush a change in progress rather than dropping it.

**Reopening a note after an unsaved session shows a banner.** If a note opens with words that never
reached the server, a bar above the text reads **Restored unsaved changes from 5m ago.** Press **Keep**
to carry on with them (they save as usual), or **Discard** to throw them away and load the note as the
server has it. Discard cannot be undone. Only people who can edit the note see the bar.

**History** keeps every version you have saved, newest first, each one named by who saved it and when.
Open one and it opens read-only with a banner reading **Viewing version from …**; press **Restore** to
bring the note back to that text (only if you can edit the note — a reader can open History and read
old versions, just not put one back).

**A note with several headings gets a small floating button, bottom left, labelled "On this page".**
Press it to open a table of contents over the note; press a heading in it to jump straight there. It
appears at any window width once a note has enough headings, whereas it used to be a column that showed
only on a wide screen. The heading you jump to lands just under the top bar, not behind it.

**Every heading in a note can be linked to.** Hover a heading (on a phone or tablet the small link icon is
always there, faintly) and press the link icon at the end of it — or Tab to it and press Enter — to copy a
link to that exact heading. Paste it anywhere; whoever opens it lands on that heading, provided they can read
the note. The icon appears on all six heading levels, and if two headings read the same the second gets a
`-2` on the end of its link, the third `-3`. Only the note page has this; the comment box and the ticket sheet
do not.

**A thin line under the top bar shows how far down a note you have read.** It fills from the left as you
scroll the note (the title and byline above the text do not count) and starts again at empty when you open
another note. It is there for everyone who can open the note, whether or not they can edit it, and it stops
animating if your device is set to reduce motion.

### Finding a note

The Notes page lists your notes as a tree, grouped by workspace and project, newest first, with a title
filter that narrows every group as you type. It opens on that list when no note is open, and when you come
back to Notes it opens the note you last had open on this device. On a tablet-width screen the list is a drawer: the
**Notes** button beside **Create note** opens and closes it. On a phone the list and the search box are in a
panel behind the round button at the bottom right, with a **Notes** / **Contents** switch once a note is open:
**Contents** lists that note's headings. **Create note** is on screen either way.

There is also a search box. Type into it and two things happen: spelling matches — the words you typed,
allowing for a near miss — appear almost immediately, and matches **by meaning** are added a little
after, without reordering what is already on screen. If your words got corrected before searching, a
line tells you so: **Showing results for …**.

**Meaning search only understands English.** Word-based search — including the near-miss correction —
also covers Garo. A meaning-aware model for Garo is not built yet (see below). The **Author** and
**Scope** filters narrow every group's search at once.

### A ticket's own notes

A ticket's panel has its own **Notes · N** section, between Subtasks and Comments, listing every note
attached to it that you can read.

Press **Attach note** to open a picker: type to search your existing notes, or keep typing something
new and an option appears — **New note: …** — that writes the note and attaches it in one step, born
with **Same as the ticket** scope.

Each attached note is a badge with an × on it (if you can edit the ticket) that detaches it — the note
itself is not deleted, only unlinked from this ticket. Detaching shows a toast you can undo.

It works the other way too: an attached ticket appears as a badge in the note's own byline. Click it and
the ticket's own panel opens right there, over the note — you are not taken to the ticket's page. Deleting the
ticket from that panel does not remove the badge; a deleted ticket stays attached (see the Notes FAQ entry on
this).

### Mentioning somebody in a note

Type `@` and start a person's name, in a note or in its comments: the same list of people the ticket editors offer
appears, and picking one drops a mention at the cursor. **A mention notifies the person, once.** Saving the note
again with the same mention in it does not tell them again; adding someone new tells only the new person, and a
comment that mentions somebody tells them as soon as it is posted. **Only people who can read the note are told**
— mentioning someone the note is not shared with sends nothing, and you are not told that either. Mentioning
yourself sends nothing. A note mention arrives in the Inbox as a *mentioned you* message, naming the note, and follows your Mentions
setting under Account → Notifications, exactly like a mention on a ticket.

### Editing or deleting a comment on a note

A comment on a note works as it does on a ticket. Each comment you wrote has a **…** button: **Edit** opens it in
place — change it and press **Save**, or **Cancel** to leave it as it was — and an edited comment says *edited*
beside its time (press the word to see when). **Delete** asks once, *Delete this comment? It is removed for
everyone.*, and leaves *Comment deleted* with who wrote it and when. Only the person who wrote a comment can edit it;
they, or a workspace owner or admin, can delete it. A deleted note's comments cannot be changed until the note is
restored. Mentions you add in an edit notify the new people only.

### Linking to a ticket or another note

Typing `:ticket ` followed by a few words, in a comment or in a note, opens a picker over the tickets you
can see; pick one and it inserts a chip showing the ticket's key and title, which opens that ticket. Typed with nothing after it, the picker lists the most recently created tickets you can see across the workspace (in a note, which belongs to no single project) or in the current project (in a ticket's own comment), so you can browse before you type.

Typing `:note ` (or `[[`) the same way opens a picker over the notes you can read, and inserts a link to
the one you pick.

**A chip or link to something that was permanently deleted reads Deleted item** — no key, no title, and
nothing to open. The comment or note that holds it is not changed: only the chip is drawn differently,
because the thing it pointed at no longer exists.

**Tagging a note in a ticket's own comment attaches that note to the ticket** — the same as pressing Attach
note yourself. Referencing a note inside the note's own comments does not attach anything anywhere.

**Linked from.** A ticket and a note each show what links to them: under the ticket's Notes, and under a
note's text, a **Linked from** list names every ticket, note and comment that chips or links to it, with
the sentence it sits in and the reference highlighted. Click a row to open it; a comment opens its ticket or
note scrolled to the comment. Only what *you* can see is listed, and the number beside the heading counts
only those. Past twenty, **Show all** loads the rest. A plain `GN-142` typed as text is not a link — only a
chip is. Nothing to list, no list.

### Deleting a note, and getting it back

A deleted note goes into a **Deleted** group on the Notes page, with a **Restore** button — you always
see your own there, and an owner or admin sees everyone's. Restoring it brings it back exactly as it
was; while deleted, the note is read-only for everyone, its own author included.

**Deleting a note:** open it and press **Delete…** beside **History** and **Knowledge Graph** — only the note's author, a
workspace admin or the owner sees it. The same confirmation a ticket's delete uses opens, with its
**Delete permanently** switch. A deleted note shows a banner on its own page; **Restore** there brings
it back, and if the server refuses (for example because the note is marked for permanent deletion
elsewhere) the banner says why. Every deleted note is also listed under **Deleted items** on your
Account page.

If a note you have open stops being shared with you — someone narrowed its scope, or detached the last
ticket it inherited from — you are taken back to the Notes list with a message: **That note is no longer
shared with you**.

### What notes cannot do yet

Honestly, not everything:

- You cannot comment on one particular passage — a comment is on the note as a whole.
- A note cannot contain another note as a sub-page.
- Notes have no screen yet on the phone or desktop apps — only the website has one.
- Meaning search understands English only; a Garo-tuned model is a planned follow-up, not built.

## §16 — Connecting Claude or ChatGPT

### What connecting does

You can let Claude or ChatGPT work in Gisik Nokma **as you**. Once it is connected you can ask it, in
ordinary words — *what is waiting on me?*, *add a ticket to the Shop floor project*, *move the chiller ticket to
Done*, *put a comment on that one* — and it does it, in the same workspaces, with the same permissions,
as if you had done it yourself.

There is nothing to install and nothing to copy between windows: you paste one web address into the
assistant, sign in the way you always do, and press **Allow**.

Three things are worth knowing before you press it:

- **It can do what you can do — all of it.** It can see and change everything you can, in every workspace
  you belong to: read tickets, create them, move them through their states, comment and assign, and create,
  rename, archive or delete workspaces and projects — see **What your assistant can do** below. There is no
  read-only choice and no picking one workspace.
- **It can never do more than you can.** A ticket you cannot see, it cannot see. A move your role does not
  allow is refused for the assistant in the same words it would be refused for you.
- **Every change it makes is recorded under your name**: the ticket's history shows it as **Assistant, for** your name.

### What your assistant can do

Ask in ordinary words; it uses the same permissions you have, so each of these works only where you could
do it yourself.

- **Workspaces.** See the workspaces you belong to, start a new one (you become its owner), rename one,
  archive or restore one, and delete one or bring it back.
- **Projects.** See a workspace's projects, start one, change its name or description, archive or restore
  it, file it in a group, and delete one or bring it back. The assistant can give a new project a short
  prefix when it starts one, and an owner or admin can have it change that prefix later (§3).
- **People.** See who is in a workspace. If you are a guest, you are shown only the people on the tickets
  shared with you — never the full list, and never anyone's email address.
- **Tickets.** Read them one project at a time, or across a whole workspace at once — *everything assigned to
  me* works — and add, move, comment on and assign them.
- **Notes.** Read, write and change notes — the whole body, one section under a heading, or a few lines at the end —
  move them, attach them to tickets, and delete or bring them back.
- **Comments.** Comment on tickets and notes, and edit or delete its own comments (an owner or admin can delete
  anyone's). Mentions like *@Asha* notify only people who can read the ticket or note.
- **Files.** Attach a file of up to 10 MB to a ticket, or a picture to a note, and read attachments back.
- **Every ticket action** — change any field, close and reopen, reorder the backlog, link two tickets (*blocks*,
  *relates to*, *duplicates*) or remove a link from either end, see a ticket's history, delete one or bring it back.
- **Your work and your inbox.** What is on your plate, what needs attention, your notifications (and marking them
  read), and invitations waiting for you.
- **Admin, with a check first.** Inviting and removing people, roles, prefixes, groups, workflows, ticket types,
  who can see a ticket and workspace settings. For each, the assistant first shows you what would change; nothing
  happens until it repeats the exact name of what it is changing — the person, the address, the ticket key or the
  item's current name.

**Formatting comes through.** The assistant writes in Markdown, so headings, lists, bold text, links, mentions and
ticket links appear in comments and notes exactly as if you had typed them in the app.

**Deleting is never final here.** When your assistant deletes a workspace or a project it goes to **Deleted
items** on your Account page, where you or the assistant can bring it back for 15 days. Nothing is erased.

**Archiving and deleting need the exact name.** The assistant must give the workspace's or project's name
exactly as it is written now — same capitals, same spaces — or nothing happens and it is told what the name
is. That is so a misheard instruction cannot hit the wrong thing. Renaming something changes the name it
must give.

### The address to paste

The address is `https://pm-api.artsourced.in/mcp`.

The easy way to get it is on the website: open **Account**, find "Connected assistants", and press
**Connect an assistant**. The panel shows the address with a **Copy** button, and a **How to connect** link
back to this chapter.

### In Claude

The steps below are for Claude on the web or in the desktop app, as of 30 September 2026. Menus in other
people's apps move; if a name has changed, look for **Connectors** in Claude's settings.

1. Open Claude's **Settings**, choose **Connectors**, press **Add**, then **Add custom connector**.
2. Paste the address above, give it a name you will recognise (for example Gisik Nokma) and press **Add**.
3. A Gisik Nokma page opens in your browser. Sign in if it asks you to, check the name and the website
   address shown on the page, and press **Allow**.

You are returned to Claude, and the connector is ready to use in any conversation.

On a Team or Enterprise plan, an owner of your Claude organisation adds the connector for the organisation
first (in the organisation's connector settings); after that each person opens **Connectors**, finds it in
the list and presses **Connect** — and then does step 3 themselves.

### In ChatGPT

The steps below are for ChatGPT on the web, as of 30 September 2026. ChatGPT calls this **Developer
mode**, and it may only be offered on some plans; a Business or Enterprise workspace may need an
administrator to switch it on for you. ChatGPT moves these menus more often than most — if a name below is
not on your screen, look for **Developer mode** and for the button that creates a new connector or app.

1. In **Settings**, turn on **Developer mode** (it has been under **Security and login**, and before that
   under **Connectors** → **Advanced**).
2. In the connectors (or apps) settings, press the button that creates a new one — **Create** or the plus
   button — paste the address above, give it a name, and choose sign-in by **OAuth** if you are asked.
3. A Gisik Nokma page opens. Sign in if it asks you to, check the name and the website address shown, and
   press **Allow**.

The new connector appears among ChatGPT's developer-mode tools; turn it on for a conversation from the
message box.

### What the Allow page shows

The page says which assistant is asking, and always shows the **website address** it will send you back to
beside that name — for Claude that is `claude.ai`, for ChatGPT it is `chatgpt.com`. An assistant's name is
whatever it calls itself, so the address is the part to trust: if you were not just adding a connector and
the address is not one you recognise, press **Deny**. **Deny** sends you back with a refusal and nothing is
connected.

If you press **Allow** twice, the second answer is refused with a plain message that the request has already
been answered. If you reload the page after answering, it says the connection request has expired. Either way
nothing extra is connected. Start again from the assistant.

### Seeing what is connected, and disconnecting

**Account** → "Connected assistants" lists everything connected as you: the assistant's name and the
website address it came from, when it was connected and when it was last used. Press **Disconnect** on a
row and that assistant loses access at once — its next request is refused.

The same list also shows anything you approved from a computer with the older, installed way of connecting
an assistant. Each row says when it was created and when it was last used (or that it was never used),
and has its own button: **Revoke this token** for an installed one, or **Disconnect** and the
assistant's name for one connected through Claude or ChatGPT, whose row shows the app's name with its web
address beside it. A token nobody has named reads **Assistant connected with a token**; its **Add a
name** button lets you say which assistant it is (the button reads **Rename** once it has a name).

Removing the connector inside Claude or ChatGPT stops that app asking; **Disconnect** here is the one that
cuts the access off from our side, so use it if you are not sure.

### If the assistant asks you to reconnect

Sometimes Claude or ChatGPT says the connector needs to be reconnected, or shows a **Connect** or **Sign
in** button beside it. That means its permission has ended — because you pressed **Disconnect**, or because
it has gone about three months without being used. Nothing is lost. Press the button and go through the
**Allow** page again; it is the same as the first time.

Day to day you never see any of this: the permission renews itself every time the assistant is used.

---

## §17 — The Knowledge Graph

### What the Knowledge Graph shows

The Knowledge Graph puts one ticket or note in the middle and draws what is linked to it around it: the
tickets it blocks, relates to or duplicates, its parent and subtasks, the notes attached to it, the tickets
and notes that mention it in their text, its project and workspace, and the people on it. Each link is a line
between two items, and each kind of link has its own colour.

It is a way of looking at your work, not a place where work is kept. Everything on it comes from the tickets
and notes themselves, so it changes when they do, and it shows only what you could open anyway.

### Where to find it

- **On a ticket:** open the ticket and choose **Knowledge Graph**, the fourth tab beside **Details**,
  **History** and **Attachments**. The ticket is in the middle.
- **On a note:** press **Knowledge Graph** under the note's title, beside **History** (on a phone it is in the
  **⋯** menu there). The graph opens in a panel with the note in the middle; close the panel to go back to
  the note. Opening a ticket from it closes the panel and opens the ticket over the note.

### Rings and the fog

Items sit on rings around the middle. The first ring is everything linked to it directly, the second is
everything linked to those, and so on; each step out is one **hop**.

Past the last clear ring is **the fog**: small grey dots and faint lines for what is one more hop away. Nothing
in the fog can be clicked. To bring it in, select an item near the edge and centre on it, or raise **Hops**.

The line above the graph counts what you are looking at: how many items are within reach, how many more are
in the fog, and how many are outside the scope you picked. When a lot is linked, the 500 nearest items are
drawn clearly and the rest go into the fog; a button at the bottom left says how many are further out and
how to reach them.

### Moving around, hops and keys

- **Click** an item to select it. The panel beside the graph (on a phone, a card under it) shows what it is,
  its main facts, its direct links grouped by kind, and a button that opens it: **Open ticket**, **Open note**,
  **Open board** or **Open workspace**. People and concepts have no page of their own to open. A concept's
  panel shows its items and its links instead, and who created it; if you may change it, each item and link has a
  **Remove** button, and the concept a **Rename** and a **Delete**. A suggested concept offers **Confirm**, with a
  name you can change, and **Reject**.
- **Double-click** an item, or select it and press **Center on** and its name, to put it in the middle. The
  one you left goes onto the trail at the top left; **Back** or the Esc key returns to it.
- **Hover** an item to fade everything that is not linked to it. **Hover a line** to read what it means — for
  example, that one ticket blocks another — and **click it** to see both ends and who added it and when.
- **Scroll or pinch** to zoom and **drag** to move around; the buttons in the corner zoom in, zoom out and fit
  the whole graph back in.
- **Hops**, above the graph on a computer, sets how many rings are clear: 1 to 4, or **Everything**. It starts
  at 2. On a phone the graph always shows one clear ring, and the next is fog.
- **Keys:** 1 to 4 set the hops, C centres on the selected item, and Esc goes back.

Under the graph, **Linked to** and the centre's name lists the same items as text, ring by ring. It works with
the keyboard and a screen reader, and each row selects or opens its item.

### Choosing what it shows

- **Link types.** One button per kind of link — **Projects**, **Parent and subtasks**, **Blocks**,
  **Relates to**, **Duplicates**, **Attached notes**, **Links in text**, **People** and **Concepts** — each
  with how many there are. Press one to hide that kind of link; a hidden kind is not followed further out
  either.
- **Scope.** **Workspaces** and **Projects** choose where the graph looks. It starts with the workspace you are
  in and all its projects. An item outside the scope stays in the fog, and the list under the graph says how
  many are outside.
- **Semantic layer.** Concepts are the topics the app finds across your tickets and notes, and the links it
  suggests between them. **Off** hides the concepts, their links and the suggestions, and the **Concepts**
  button goes away. It only changes what you see on this browser: nothing is saved to a ticket, and nobody
  else's view changes. It starts **On**, and the browser remembers your choice.

On a phone, the scope, the link types and the semantic layer fold into one **Scope and links** button.

### Removing a link from the graph

Click a **Blocks**, **Relates to** or **Duplicates** line, then **Remove link**. The link goes from both
tickets, as if you had removed it in the ticket's **Links** section, and **Undo** puts it back. If you are not
allowed to change that link, the panel says why and nothing changes.

The panel also says who added a link and when. A link your assistant added (§16) ends with **via an
assistant**; in the ticket's History the same change reads **Assistant, for** your name.

A ticket with no links yet says so in the middle of the graph and offers **Add link**, which takes you to the
ticket's **Details** tab, where links are added.
